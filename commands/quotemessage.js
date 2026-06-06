const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

class EmbedBuilder {
  constructor() {
    this.container = new ContainerBuilder();
    this.title = null;
    this.description = null;
    this.thumbnailUrl = null;
    this.imageUrl = null;
    this.fields = [];
    this.footer = null;
    this.color = 0x3b82f6; // default color
    this.url = null;
  }
  setTitle(t) { this.title = t; return this; }
  setDescription(d) { this.description = d; return this; }
  setThumbnail(u) { this.thumbnailUrl = u; return this; }
  setImage(u) { this.imageUrl = u; return this; }
  setColor(c) { this.color = c; return this; }
  setURL(u) { this.url = u; return this; }
  addFields(...f) {
    for (const field of f) {
      if (Array.isArray(field)) {
        this.fields.push(...field);
      } else {
        this.fields.push(field);
      }
    }
    return this;
  }
  setFooter(f) { this.footer = f.text; return this; }
  setAuthor(a) { this.author = a.name; return this; }
  setTimestamp() { return this; }

  toJSON() {
    this.container.setAccentColor(this.color);

    // Add title/description/thumbnail in a section if thumbnail exists
    if (this.thumbnailUrl) {
      const section = new SectionBuilder();

      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));

      section.setThumbnailAccessory(new ThumbnailBuilder().setURL(this.thumbnailUrl));

      this.container.addSectionComponents(section);
    } else if (this.title || this.description) {
      // No thumbnail, so add title/description directly to the container (no SectionBuilder needed)
      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));
    }

    for (const f of this.fields) {
      this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${f.name}**\n${f.value}`));
    }

    if (this.imageUrl) {
      this.container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: this.imageUrl } })
      );
    }

    if (this.footer) {
      this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- # ${this.footer}`));
    }

    return this.container.toJSON();
  }
}


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

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
