const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags, time, TimestampStyles } = require('discord.js');
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


module.exports = {
  data: new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Convert a date/time into Discord timestamp tags.')
    .addStringOption((opt) =>
      opt
        .setName('datetime')
        .setDescription('Date/time string, e.g. "2026-12-25", "2026-12-25 18:00", "tomorrow". Defaults to now.')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const input = interaction.options.getString('datetime');
    let date;

    if (!input || input.toLowerCase() === 'now') {
      date = new Date();
    } else if (input.toLowerCase() === 'tomorrow') {
      date = new Date(Date.now() + 86_400_000);
    } else if (input.toLowerCase() === 'yesterday') {
      date = new Date(Date.now() - 86_400_000);
    } else {
      date = new Date(input);
    }

    if (isNaN(date.getTime())) {
      return interaction.reply({
        content: `Couldn't parse **${input}** as a date. Try formats like \`2026-12-25\` or \`2026-12-25 18:00\`.`,
        ephemeral: true,
      });
    }

    const unix = Math.floor(date.getTime() / 1000);

    const styles = [
      { label: 'Short Time',       tag: `<t:${unix}:t>`, style: TimestampStyles.ShortTime },
      { label: 'Long Time',        tag: `<t:${unix}:T>`, style: TimestampStyles.LongTime },
      { label: 'Short Date',       tag: `<t:${unix}:d>`, style: TimestampStyles.ShortDate },
      { label: 'Long Date',        tag: `<t:${unix}:D>`, style: TimestampStyles.LongDate },
      { label: 'Short Date/Time',  tag: `<t:${unix}:f>`, style: TimestampStyles.ShortDateTime },
      { label: 'Long Date/Time',   tag: `<t:${unix}:F>`, style: TimestampStyles.LongDateTime },
      { label: 'Relative',         tag: `<t:${unix}:R>`, style: TimestampStyles.RelativeTime },
    ];

    const embed = new EmbedBuilder()
      .setTitle('🕐 Timestamp Tags')
      .setDescription(`Unix epoch: \`${unix}\``)
      .addFields(
        styles.map(({ label, tag, style }) => ({
          name: label,
          value: `${time(date, style)} — \`${tag}\``,
          inline: false,
        })),
      )
      .setColor(0x8b5cf6);

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
