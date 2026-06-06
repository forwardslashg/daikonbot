const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');

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

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    },
  };
}

module.exports = { buildImageEffectCommand };
