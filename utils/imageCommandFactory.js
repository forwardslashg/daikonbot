const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('./commandConfig');
const {
  resolveImageFromInteraction,
  buildPopcatEffectUrl,
} = require('./imageTools');

function buildImageEffectCommand(config) {
  const {
    name,
    description,
    effect,
    color = 0x3b82f6,
  } = config;

  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .addStringOption((opt) =>
        opt
          .setName('image')
          .setDescription('Image URL (optional)')
          .setRequired(false),
      )
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('Use this user\'s avatar as the image')
          .setRequired(false),
      )
      .setIntegrationTypes(userInstallConfig.integrationTypes)
      .setContexts(userInstallConfig.contexts),

    async execute(interaction) {
      await interaction.deferReply();

      const { imageUrl, source } = resolveImageFromInteraction(interaction, {
        imageOptionName: 'image',
        userOptionName: 'user',
        fallbackToInvokerAvatar: true,
      });

      if (!imageUrl) {
        await interaction.editReply('No image found. Pass an `image` URL or use the message command **Use this image** first.');
        return;
      }

      const outputUrl = buildPopcatEffectUrl(effect, imageUrl);

      const embed = new EmbedBuilder()
        .setTitle(`/${name}`)
        .setDescription(`Source: **${source.replace('-', ' ')}**`)
        .setColor(color)
        .setImage(outputUrl)
        .setFooter({ text: 'Effect by Popcat API' });

      await interaction.editReply({ embeds: [embed] });
    },
  };
}

module.exports = { buildImageEffectCommand };
