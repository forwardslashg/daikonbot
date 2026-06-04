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

    // Add title/description/thumbnail in a section
    if (this.title || this.description || this.thumbnailUrl) {
      const section = new SectionBuilder();

      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));

      if (this.thumbnailUrl) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(this.thumbnailUrl));
      }

      if (section.components && section.components.length > 0) {
        this.container.addSectionComponents(section);
      }
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

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
