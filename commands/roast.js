const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Get the AI to roast you or someone else 🔥')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('User to roast (defaults to you)')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

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

    const target  = interaction.options.getUser('user') ?? interaction.user;
    const fetched = await target.fetch().catch(() => target);
    const member  = interaction.guild?.members.cache.get(target.id);

    const displayName = member?.displayName ?? fetched.globalName ?? fetched.username;
    const joinedNote  = member?.joinedAt ? `Joined server: ${member.joinedAt.toUTCString()}` : null;
    const rolesNote   = member?.roles?.cache
      ? `Roles: ${[...member.roles.cache.values()].filter((r) => r.name !== '@everyone').map((r) => r.name).join(', ') || 'none'}`
      : null;

    const targetInfo = [
      `Display name: ${displayName}`,
      `Username: @${fetched.username}`,
      `Account created: ${fetched.createdAt.toUTCString()}`,
      fetched.bot ? 'They are a bot.' : null,
      joinedNote,
      rolesNote,
      `Requester: ${interaction.user.username} (${interaction.user.id === target.id ? 'roasting themselves' : 'roasting someone else'})`,
    ]
      .filter(Boolean)
      .join('\n');

    const sysInstruction = buildSystemInstruction(userId, 'roast');

    try {
      const text = await sendWithRetry(() =>
        callAI(sysInstruction, `Please roast this Discord user:\n\n${targetInfo}`, [], { userId }),
      );

      if (!text) {
        await interaction.editReply('The AI had nothing to say. They got off easy this time.');
        return;
      }

      const isSelf = interaction.user.id === target.id;
      const embed  = new EmbedBuilder()
        .setTitle(`🔥 Roast: ${displayName}`)
        .setDescription(text)
        .setThumbnail(fetched.displayAvatarURL({ size: 128 }))
        .setColor(0xef4444)
        .setFooter({
          text: isSelf
            ? `${interaction.user.username} asked for this`
            : `Requested by ${interaction.user.username}`,
        });

      const footer = isOwner(userId) ? null : `-# ${remainingUses(userId)} AI credit(s) remaining this hour.`;

      await sendWithRetry(() =>
        interaction.editReply({
          embeds: [embed],
          content: footer ?? undefined,
        }),
      );
    } catch (err) {
      console.error('[roast]', err);
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
