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
    .setName('vibe')
    .setDescription('Get the AI to read someone\'s vibe ✨')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('User to vibe check (defaults to you)')
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

    // Account age in days
    const ageMs   = Date.now() - fetched.createdTimestamp;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    const targetInfo = [
      `Display name: ${displayName}`,
      `Username: @${fetched.username}`,
      `Account age: ~${ageDays} days old`,
      fetched.bot ? 'They are a bot.' : 'They are a human.',
      joinedNote,
      rolesNote,
    ]
      .filter(Boolean)
      .join('\n');

    const sysInstruction = buildSystemInstruction(userId, 'vibe');

    try {
      const text = await sendWithRetry(() =>
        callAI(sysInstruction, `Give a vibe check for this Discord user:\n\n${targetInfo}`, [], { userId }),
      );

      if (!text) {
        await interaction.editReply('No vibes detected. Truly an enigma.');
        return;
      }

      const isSelf  = interaction.user.id === target.id;
      const colours = [0x8b5cf6, 0x06b6d4, 0xf59e0b, 0x10b981, 0xec4899];
      const colour  = colours[Math.floor(Math.random() * colours.length)];

      const embed = new EmbedBuilder()
        .setTitle(`✨ Vibe Check: ${displayName}`)
        .setDescription(text)
        .setThumbnail(fetched.displayAvatarURL({ size: 128 }))
        .setColor(colour)
        .setFooter({
          text: isSelf
            ? `${interaction.user.username} wanted their vibes read`
            : `Requested by ${interaction.user.username}`,
        });

      const footer = isOwner(userId) ? null : `-# ${remainingUses(userId)} AI credit(s) remaining this hour.`;

      await sendWithRetry(() =>
        interaction.editReply({ embeds: [embed], content: footer ?? undefined }),
      );
    } catch (err) {
      console.error('[vibe]', err);
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
