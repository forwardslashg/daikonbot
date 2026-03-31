const { SlashCommandBuilder, EmbedBuilder, InteractionContextType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  checkRateLimit,
  consumeRateLimit,
  remainingUses,
  sendWithRetry,
  callAI,
  buildSystemInstruction,
  getContentFilterInfo,
} = require('../utils/aiEngine');

function makeRecoveryButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ai_newtopic:${userId}`)
      .setLabel('Reset chat')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ai_switchmodel:${userId}`)
      .setLabel('Switch model')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
  );
}

// Fetch up to N recent messages from a channel (returns formatted string)
async function fetchMessages(interaction, count) {
  try {
    const channel = interaction.channel;
    if (!channel?.messages) return null;

    const fetched = await channel.messages.fetch({ limit: Math.min(count, 100), before: interaction.id });
    if (!fetched.size) return null;

    const sorted = [...fetched.values()].reverse();
    const lines  = sorted
      .filter((m) => m.content || m.attachments.size)
      .map((m) => {
        const who  = m.author.bot ? `[BOT] ${m.author.username}` : m.author.username;
        const text = m.content ? m.content.replace(/\n+/g, ' ') : '(no text)';
        const ext  = m.attachments.size ? ` [${m.attachments.size} attachment(s)]` : '';
        return `${who}: ${text}${ext}`;
      });

    return lines.length ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tldr')
    .setDescription('AI-powered summary of recent chat messages')
    .addIntegerOption((opt) =>
      opt
        .setName('messages')
        .setDescription('How many recent messages to summarise (10–100, default 40)')
        .setMinValue(10)
        .setMaxValue(100)
        .setRequired(false),
    )
    // Only available in guild / DM contexts where channel history exists
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
    ]),

  async execute(interaction) {
    const userId = interaction.user.id;

    if (!isOwner(userId)) {
      const check = checkRateLimit(userId);
      if (!check.allowed) {
        await interaction.reply({ content: check.message, ephemeral: true });
        return;
      }
      consumeRateLimit(userId);
    }

    await interaction.deferReply();

    const count = interaction.options.getInteger('messages') ?? 40;
    const history = await fetchMessages(interaction, count);

    if (!history) {
      await interaction.editReply('Could not fetch channel messages. Make sure I have access to this channel.');
      return;
    }

    const channelName  = interaction.channel?.name ? `#${interaction.channel.name}` : 'this channel';
    const sysInstruction = buildSystemInstruction(userId, 'tldr');

    try {
      const text = await sendWithRetry(() =>
        callAI(
          sysInstruction,
          `Please summarise the following ${count} Discord messages from ${channelName}:\n\n${history}`,
          [],
          { userId },
        ),
      );

      if (!text) {
        await interaction.editReply('The AI couldn\'t produce a summary. Try again.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 TL;DR — ${channelName}`)
        .setDescription(text.slice(0, 4000))
        .setColor(0x6366f1)
        .setFooter({ text: `Last ${count} messages · Requested by ${interaction.user.username}` });

      const footer = isOwner(userId) ? null : `-# ${remainingUses(userId)} AI credit(s) remaining this hour.`;

      await sendWithRetry(() =>
        interaction.editReply({ embeds: [embed], content: footer ?? undefined }),
      );
    } catch (err) {
      console.error('[tldr]', err);
      const filtered = getContentFilterInfo(err);
      const msg = filtered
        ? filtered.userMessage
        : 'An unknown AI error occurred. You can reset chat or switch models below and retry.';
      await interaction.editReply({
        content: msg,
        embeds: [],
        components: [makeRecoveryButtons(userId)],
      }).catch(() => {});
    }
  },
};
