const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const SIZES = [128, 256, 512, 1024, 2048, 4096];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Get a user's avatar.")
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

    // Prefer the guild-specific avatar when available
    const member = interaction.guild?.members.cache.get(target.id);
    const avatarUrl =
      member?.displayAvatarURL({ size: 4096, extension: 'png' }) ??
      target.displayAvatarURL({ size: 4096, extension: 'png' });

    const links = SIZES.map((s) => {
      const url =
        member?.displayAvatarURL({ size: s, extension: 'png' }) ??
        target.displayAvatarURL({ size: s, extension: 'png' });
      return `[${s}](${url})`;
    }).join(' · ');

    const embed = new EmbedBuilder()
      .setTitle(`${target.displayName}'s avatar`)
      .setImage(avatarUrl)
      .setDescription(links)
      .setColor(0x8b5cf6);

    await interaction.reply({ embeds: [embed] });
  },
};
