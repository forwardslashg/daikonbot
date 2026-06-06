const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags,
  time,
  TimestampStyles,
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
    .setName('Quick Profile')
    .setType(ApplicationCommandType.User)
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const target = interaction.targetUser;
    await interaction.deferReply({ ephemeral: true });

    const fetched = await target.fetch().catch(() => target);
    const member = interaction.guild?.members.cache.get(target.id) ?? null;

    const embed = new EmbedBuilder()
      .setTitle(`Profile: ${fetched.tag ?? fetched.username}`)
      .setThumbnail(fetched.displayAvatarURL({ size: 256 }))
      .setColor(fetched.accentColor ?? 0x10b981)
      .addFields(
        { name: 'User ID', value: fetched.id, inline: true },
        { name: 'Bot', value: fetched.bot ? 'Yes' : 'No', inline: true },
        {
          name: 'Created',
          value: time(fetched.createdAt, TimestampStyles.RelativeTime),
          inline: true,
        },
      );

    if (member?.joinedAt) {
      embed.addFields({
        name: 'Joined Server',
        value: time(member.joinedAt, TimestampStyles.RelativeTime),
        inline: true,
      });
    }

    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
