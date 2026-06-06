const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');
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


/**
 * Parse a hex color string (with or without #) into { r, g, b } and a normalised hex string.
 * Returns null if invalid.
 */
function parseHex(input) {
  const clean = input.replace(/^#/, '').toLowerCase();
  // Expand shorthand: fff → ffffff
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/.test(full)) return null;

  const int = parseInt(full, 16);
  return {
    hex: `#${full.toUpperCase()}`,
    int,
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

/** Convert RGB to HSL. Returns { h, s, l } (h: 0-360, s/l: 0-100). */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    h = s = 0;
  } else {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color')
    .setDescription('Preview a hex color and see its values.')
    .addStringOption((opt) =>
      opt
        .setName('hex')
        .setDescription('Hex color code, e.g. #8b5cf6 or 8b5cf6.')
        .setRequired(true),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const input = interaction.options.getString('hex').trim();
    const parsed = parseHex(input);

    if (!parsed) {
      return interaction.reply({
        content: `**${input}** is not a valid hex color. Try something like \`#8b5cf6\` or \`fff\`.`,
        ephemeral: true,
      });
    }

    const { hex, int, r, g, b } = parsed;
    const { h, s, l } = rgbToHsl(r, g, b);

    // Use a colored 1×1 PNG generated via a public color API as the thumbnail
    const imageUrl = `https://singlecolorimage.com/get/${hex.slice(1)}/80x80`;

    const embed = new EmbedBuilder()
      .setTitle(hex)
      .setThumbnail(imageUrl)
      .addFields(
        { name: 'HEX', value: `\`${hex}\``, inline: true },
        { name: 'RGB', value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
        { name: 'HSL', value: `\`hsl(${h}, ${s}%, ${l}%)\``, inline: true },
        { name: 'Decimal', value: `\`${int}\``, inline: true },
      )
      .setColor(int);

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
