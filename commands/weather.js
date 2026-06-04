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


async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Weather API request failed (${res.status})`);
  }

  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Get current weather for a city')
    .addStringOption((opt) =>
      opt
        .setName('location')
        .setDescription('City or location name')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const location = interaction.options.getString('location', true).trim();

    try {
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
      const data = await fetchJson(url);

      const current = data?.current_condition?.[0];
      const nearest = data?.nearest_area?.[0];

      if (!current || !nearest) {
        await interaction.editReply('Could not find weather data for that location.');
        return;
      }

      const areaName = nearest?.areaName?.[0]?.value ?? location;
      const region = nearest?.region?.[0]?.value;
      const country = nearest?.country?.[0]?.value;
      const resolved = [areaName, region, country].filter(Boolean).join(', ');

      const embed = new EmbedBuilder()
        .setTitle(`Weather: ${resolved}`)
        .setDescription(current.weatherDesc?.[0]?.value ?? 'No description')
        .addFields(
          { name: 'Temperature', value: `${current.temp_C} C (${current.temp_F} F)`, inline: true },
          { name: 'Feels Like', value: `${current.FeelsLikeC} C (${current.FeelsLikeF} F)`, inline: true },
          { name: 'Humidity', value: `${current.humidity}%`, inline: true },
          { name: 'Wind', value: `${current.windspeedKmph} km/h ${current.winddir16Point ?? ''}`.trim(), inline: true },
          { name: 'Cloud Cover', value: `${current.cloudcover}%`, inline: true },
          { name: 'Visibility', value: `${current.visibility} km`, inline: true },
        )
        .setColor(0x0ea5e9)
        .setFooter({ text: 'Data from wttr.in' });

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[weather]', err);
      await interaction.editReply('Failed to fetch weather right now. Try again later.');
    }
  },
};