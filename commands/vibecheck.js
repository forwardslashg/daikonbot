const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  checkRateLimit,
  consumeRateLimit,
  remainingUses,
  sendWithRetry,
  callAI,
  buildSystemInstruction,
} = require('../utils/aiEngine');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Vibe Check')
    .setType(ApplicationCommandType.User)
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

    const target  = interaction.targetUser;
    const fetched = await target.fetch().catch(() => target);
    const member  = interaction.guild?.members.cache.get(target.id);

    const displayName = member?.displayName ?? fetched.globalName ?? fetched.username;
    const joinedNote  = member?.joinedAt ? `Joined server: ${member.joinedAt.toUTCString()}` : null;
    const rolesNote   = member?.roles?.cache
      ? `Roles: ${[...member.roles.cache.values()].filter((r) => r.name !== '@everyone').map((r) => r.name).join(', ') || 'none'}`
      : null;

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
        await interaction.editReply('No vibes detected. Truly unknowable.');
        return;
      }

      const colours = [0x8b5cf6, 0x06b6d4, 0xf59e0b, 0x10b981, 0xec4899];
      const colour  = colours[Math.floor(Math.random() * colours.length)];

      const embed = new EmbedBuilder()
        .setTitle(`✨ Vibe Check: ${displayName}`)
        .setDescription(text)
        .setThumbnail(fetched.displayAvatarURL({ size: 128 }))
        .setColor(colour)
        .setFooter({ text: `Requested by ${interaction.user.username}` });

      const footer = isOwner(userId) ? null : `-# ${remainingUses(userId)} AI use(s) remaining this hour.`;

      await sendWithRetry(() =>
        interaction.editReply({ embeds: [embed], content: footer ?? undefined }),
      );
    } catch (err) {
      console.error('[vibe ctx]', err);
      await interaction.editReply('Failed to check vibes. Try again later.').catch(() => {});
    }
  },
};
