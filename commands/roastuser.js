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
    .setName('Roast User')
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

    const targetInfo = [
      `Display name: ${displayName}`,
      `Username: @${fetched.username}`,
      `Account created: ${fetched.createdAt.toUTCString()}`,
      fetched.bot ? 'They are a bot.' : null,
      joinedNote,
      rolesNote,
      `Requester: ${interaction.user.username}`,
    ]
      .filter(Boolean)
      .join('\n');

    const sysInstruction = buildSystemInstruction(userId, 'roast');

    try {
      const text = await sendWithRetry(() =>
        callAI(sysInstruction, `Please roast this Discord user:\n\n${targetInfo}`, [], { userId }),
      );

      if (!text) {
        await interaction.editReply('Nothing to roast here. They live to see another day.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔥 Roast: ${displayName}`)
        .setDescription(text)
        .setThumbnail(fetched.displayAvatarURL({ size: 128 }))
        .setColor(0xef4444)
        .setFooter({ text: `Requested by ${interaction.user.username}` });

      const footer = isOwner(userId) ? null : `-# ${remainingUses(userId)} AI use(s) remaining this hour.`;

      await sendWithRetry(() =>
        interaction.editReply({ embeds: [embed], content: footer ?? undefined }),
      );
    } catch (err) {
      console.error('[roast ctx]', err);
      await interaction.editReply('Failed to generate a roast. Try again later.').catch(() => {});
    }
  },
};
