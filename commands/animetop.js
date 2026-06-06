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


async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`API request failed (${res.status})`);
  }

  return res.json();
}

function trim(text, max) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

const FILTER_LABELS = {
  airing: 'Top Airing Anime',
  upcoming: 'Top Upcoming Anime',
  bypopularity: 'Most Popular Anime',
  favorite: 'Most Favorited Anime',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animetop')
    .setDescription('Browse top anime charts')
    .addStringOption((opt) =>
      opt
        .setName('filter')
        .setDescription('Which chart to view (default: all-time top rated)')
        .setRequired(false)
        .addChoices(
          { name: 'All-Time Top Rated', value: 'bypopularity' },
          { name: 'Currently Airing', value: 'airing' },
          { name: 'Upcoming', value: 'upcoming' },
          { name: 'Most Favorited', value: 'favorite' },
        ),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('count')
        .setDescription('How many entries to show (1-10, default 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const filter = interaction.options.getString('filter') ?? 'bypopularity';
    const count = interaction.options.getInteger('count') ?? 5;

    try {
      const response = await fetchJson(
        `https://api.jikan.moe/v4/top/anime?filter=${filter}&limit=${count}`,
      );
      const animeList = response?.data?.slice(0, count) ?? [];

      if (!animeList.length) {
        await interaction.editReply('No anime data is available right now.');
        return;
      }

      const lines = animeList.map((anime, index) => {
        const score = anime.score ? `${anime.score}/10` : 'N/A';
        const episodes = anime.episodes ? `${anime.episodes} eps` : '? eps';
        const synopsis = trim(anime.synopsis?.replace(/\s+/g, ' '), 100) ?? 'No synopsis.';
        return `**${index + 1}. [${anime.title}](${anime.url})**\nScore: ${score} | ${episodes} | ${anime.type ?? 'Unknown'}\n${synopsis}`;
      });

      const topAnime = animeList[0];
      const embed = new EmbedBuilder()
        .setTitle(FILTER_LABELS[filter] ?? 'Top Anime')
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setColor(0xf97316)
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = topAnime?.images?.jpg?.image_url;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animetop]', err);
      await interaction.editReply('Failed to fetch the top anime list right now. Try again in a moment.');
    }
  },
};
