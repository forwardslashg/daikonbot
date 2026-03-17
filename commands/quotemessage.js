const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Quote Message')
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const message = interaction.targetMessage;

    if (!message) {
      await interaction.reply({
        content: 'Could not read that message.',
        ephemeral: true,
      });
      return;
    }

    const jumpUrl = message.url;
    const content = message.content?.trim() || '*No text content*';

    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL({ size: 128 }),
      })
      .setDescription(content.slice(0, 4000))
      .setColor(0xf59e0b)
      .addFields({ name: 'Source', value: `[Jump to message](${jumpUrl})` })
      .setTimestamp(message.createdAt);

    const firstAttachment = message.attachments.first();
    if (firstAttachment?.contentType?.startsWith('image/')) {
      embed.setImage(firstAttachment.url);
    }

    await interaction.reply({ embeds: [embed] });
  },
};
