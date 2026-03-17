const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  time,
  TimestampStyles,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Quick Profile')
    .setType(ApplicationCommandType.User)
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const target = interaction.targetUser;
    await interaction.deferReply({ ephemeral: true });

    const fetched = await target.fetch().catch(() => target);
    const member = interaction.guild?.members.cache.get(target.id) ?? null;

    const embed = new EmbedBuilder()
      .setTitle(`Profile: ${fetched.tag ?? fetched.username}`)
      .setThumbnail(fetched.displayAvatarURL({ size: 256 }))
      .setColor(fetched.accentColor ?? 0x10b981)
      .addFields(
        { name: 'User ID', value: fetched.id, inline: true },
        { name: 'Bot', value: fetched.bot ? 'Yes' : 'No', inline: true },
        {
          name: 'Created',
          value: time(fetched.createdAt, TimestampStyles.RelativeTime),
          inline: true,
        },
      );

    if (member?.joinedAt) {
      embed.addFields({
        name: 'Joined Server',
        value: time(member.joinedAt, TimestampStyles.RelativeTime),
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
