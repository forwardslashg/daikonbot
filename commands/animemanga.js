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
    .setName('animemanga')
    .setDescription('Look up a manga or light novel')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Manga or light novel title to search')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title', true).trim();

    try {
      const search = await fetchJson(
        `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`,
      );
      const manga = search?.data?.[0];

      if (!manga) {
        await interaction.editReply(`No manga found for \`${title}\`.`);
        return;
      }

      const genres = (manga.genres ?? []).slice(0, 4).map((g) => g.name).filter(Boolean);
      const authors = (manga.authors ?? []).slice(0, 3).map((a) => a.name).filter(Boolean);
      const chapters = manga.chapters ? String(manga.chapters) : 'Unknown';
      const volumes = manga.volumes ? String(manga.volumes) : 'Unknown';
      const score = manga.score ? `${manga.score}/10` : 'N/A';
      const rank = manga.rank ? `#${manga.rank}` : 'Unranked';
      const status = manga.status ?? 'Unknown';

      const embed = new EmbedBuilder()
        .setTitle(manga.title)
        .setURL(manga.url)
        .setDescription(trim(manga.synopsis?.replace(/\n{3,}/g, '\n\n'), 1200) ?? 'No synopsis available.')
        .setColor(0x10b981)
        .addFields(
          { name: 'Type', value: manga.type ?? 'Unknown', inline: true },
          { name: 'Chapters', value: chapters, inline: true },
          { name: 'Volumes', value: volumes, inline: true },
          { name: 'Score', value: score, inline: true },
          { name: 'Rank', value: rank, inline: true },
          { name: 'Status', value: status, inline: true },
          { name: 'Genres', value: genres.length ? genres.join(', ') : 'No genres listed', inline: false },
          { name: 'Authors', value: authors.length ? authors.join(', ') : 'No author data', inline: false },
        )
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = manga.images?.jpg?.large_image_url ?? manga.images?.jpg?.image_url;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animemanga]', err);
      await interaction.editReply('Failed to fetch manga info right now. Try again in a moment.');
    }
  },
};
