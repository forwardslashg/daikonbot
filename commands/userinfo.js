const { SlashCommandBuilder, EmbedBuilder, time, TimestampStyles } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display information about a user.')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('User to look up (defaults to you).')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.deferReply();

    // Fetch full user to get banner etc.
    const fetched = await target.fetch().catch(() => target);
    const member = interaction.guild?.members.cache.get(target.id);

    const embed = new EmbedBuilder()
      .setTitle(fetched.tag ?? fetched.username)
      .setThumbnail(fetched.displayAvatarURL({ size: 256 }))
      .setColor(fetched.accentColor ?? 0x8b5cf6)
      .addFields(
        { name: 'ID', value: fetched.id, inline: true },
        { name: 'Bot?', value: fetched.bot ? 'Yes' : 'No', inline: true },
        {
          name: 'Account Created',
          value: time(fetched.createdAt, TimestampStyles.RelativeTime),
          inline: true,
        },
      );

    if (member) {
      embed.addFields(
        {
          name: 'Joined Server',
          value: member.joinedAt
            ? time(member.joinedAt, TimestampStyles.RelativeTime)
            : 'Unknown',
          inline: true,
        },
        {
          name: 'Roles',
          value:
            member.roles.cache
              .filter((r) => r.id !== interaction.guild.id)
              .map((r) => r.toString())
              .join(', ') || 'None',
          inline: false,
        },
      );
    }

    if (fetched.bannerURL()) {
      embed.setImage(fetched.bannerURL({ size: 512 }));
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
