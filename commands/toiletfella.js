const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

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


// Shared install/context settings applied to every command.
// Since all commands are user-installed, the helper is imported by each command file.
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toiletfella')
    .setDescription('toilet fella')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const query = encodeURIComponent('toilet bound hanako kun');
      const url = `https://api.klipy.com/v2/search?q=${query}&key=${process.env.KLIPY_API_KEY}&limit=50&media_filter=gif`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`KLIPY API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        await interaction.editReply('you shouldnt see this');
        return;
      }

      const random = data.results[Math.floor(Math.random() * data.results.length)];
      const gifUrl = random.media_formats.gif.url;
      const pageUrl = random.url;

      const embed = new EmbedBuilder()
        .setTitle('Toilet Nigga')
        .setURL(pageUrl)
        .setImage(gifUrl)
        .setColor(0x8b5cf6)
        .setFooter({ text: 'Sponsored by VS SOUND TEAM' });

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply('Failed to fetch a GIF. Check your KLIPY API key.');
    }
  },
};
