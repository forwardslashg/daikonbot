const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  extractImageUrlFromMessage,
  setSelectedImage,
} = require('../utils/imageTools');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Use this image')
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const imageUrl = extractImageUrlFromMessage(message);

    if (!imageUrl) {
      await interaction.reply({
        content: 'I could not find an image in that message. Pick a message with an image attachment, embed image, or direct image URL.',
        ephemeral: true,
      });
      return;
    }

    setSelectedImage(interaction.user.id, imageUrl);

    await interaction.reply({
      content: `Saved image for your next image commands.\n\`${imageUrl}\``,
      ephemeral: true,
    });
  },
};
