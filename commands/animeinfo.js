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
    throw new Error(`API request failed (${res.status})`);
  }

  return res.json();
}

function trim(text, max) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animeinfo')
    .setDescription('Look up an anime series or movie')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Anime title to search')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title', true).trim();

    try {
      const search = await fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      const anime = search?.data?.[0];

      if (!anime) {
        await interaction.editReply(`No anime found for \`${title}\`.`);
        return;
      }

      const genres = (anime.genres ?? []).slice(0, 4).map((genre) => genre.name).filter(Boolean);
      const studios = (anime.studios ?? []).slice(0, 3).map((studio) => studio.name).filter(Boolean);
      const episodes = anime.episodes ? String(anime.episodes) : 'Unknown';
      const score = anime.score ? `${anime.score}/10` : 'N/A';
      const rank = anime.rank ? `#${anime.rank}` : 'Unranked';
      const status = anime.status ?? 'Unknown';
      const year = anime.year ?? anime.aired?.prop?.from?.year ?? 'Unknown';

      const embed = new EmbedBuilder()
        .setTitle(anime.title)
        .setURL(anime.url)
        .setDescription(trim(anime.synopsis?.replace(/\n{3,}/g, '\n\n'), 1200) ?? 'No synopsis available.')
        .setColor(0xf59e0b)
        .addFields(
          { name: 'Type', value: anime.type ?? 'Unknown', inline: true },
          { name: 'Episodes', value: episodes, inline: true },
          { name: 'Status', value: status, inline: true },
          { name: 'Score', value: score, inline: true },
          { name: 'Rank', value: rank, inline: true },
          { name: 'Year', value: String(year), inline: true },
          { name: 'Genres', value: genres.length ? genres.join(', ') : 'No genres listed', inline: false },
          { name: 'Studios', value: studios.length ? studios.join(', ') : 'No studio data', inline: false },
        )
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animeinfo]', err);
      await interaction.editReply('Failed to fetch anime info right now. Try again in a moment.');
    }
  },
};