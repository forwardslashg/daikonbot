const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder } = require('discord.js');

class EmbedBuilder {
  constructor() {
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
  setAuthor(a) { this.author = a?.name; return this; }
  setTimestamp() { return this; }

  toJSON() {
    const rawContainer = {
      type: 17,
      components: [],
    };
    if (this.color) {
      rawContainer.accent_color = this.color;
    }

    if (this.author || this.title || this.description || this.thumbnailUrl) {
      const section = { type: 9, components: [] };

      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (this.author) section.components.push({ type: 10, content: `### ${this.author}` });
      if (titleText) section.components.push({ type: 10, content: titleText });
      if (this.description) section.components.push({ type: 10, content: this.description });

      if (this.thumbnailUrl) {
        section.accessory = { type: 11, media: { url: this.thumbnailUrl } };
        rawContainer.components.push(section);
      } else {
        rawContainer.components.push(...section.components);
      }
    }

    for (const f of this.fields) {
      rawContainer.components.push({ type: 10, content: `**${f.name}**\n${f.value}` });
    }

    if (this.imageUrl) {
      rawContainer.components.push({
        type: 12,
        items: [{ media: { url: this.imageUrl } }]
      });
    }

    if (this.footer) {
      rawContainer.components.push({ type: 10, content: `- # ${this.footer}` });
    }

    return rawContainer;
  }
}

module.exports = { EmbedBuilder };
