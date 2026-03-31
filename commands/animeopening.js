const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const ANIMETHEMES_API = 'https://api.animethemes.moe';
const ANIMETHEMES_SITE = 'https://animethemes.moe';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`API request failed (${res.status})`);
  }

  return res.json();
}

function getAnimeResults(payload) {
  if (Array.isArray(payload?.anime)) return payload.anime;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeThemeType(rawType) {
  const value = String(rawType ?? '').toUpperCase();
  if (value.startsWith('ED')) return 'endings';
  if (value.startsWith('OP')) return 'openings';
  return null;
}

function themeDisplayLabel(theme, fallbackIndex = 1) {
  const kind = normalizeThemeType(theme?.type) === 'endings' ? 'ED' : 'OP';
  const seq = Number.isInteger(theme?.sequence) && theme.sequence > 0
    ? theme.sequence
    : fallbackIndex;
  return `${kind} ${seq}`;
}

function firstVideoLink(theme) {
  const entries = Array.isArray(theme?.animethemeentries) ? theme.animethemeentries : [];
  for (const entry of entries) {
    const videos = Array.isArray(entry?.videos) ? entry.videos : [];
    for (const video of videos) {
      if (typeof video?.link === 'string' && video.link.trim()) {
        return video.link.trim();
      }
    }
  }
  return null;
}

function extractThemeItems(anime, requestedType) {
  const rawThemes = Array.isArray(anime?.animethemes) ? anime.animethemes : [];
  const items = [];

  let openingCount = 0;
  let endingCount = 0;

  for (const theme of rawThemes) {
    const type = normalizeThemeType(theme?.type);
    if (!type) continue;
    if (requestedType !== 'both' && requestedType !== type) continue;

    if (type === 'openings') openingCount += 1;
    if (type === 'endings') endingCount += 1;

    const fallbackIndex = type === 'openings' ? openingCount : endingCount;
    const songTitle = theme?.song?.title || 'Unknown title';
    const artists = Array.isArray(theme?.song?.artists)
      ? theme.song.artists.map((artist) => artist?.name).filter(Boolean)
      : [];
    const artistText = artists.length ? artists.join(', ') : null;
    const episodes = Array.isArray(theme?.animethemeentries)
      ? theme.animethemeentries.map((entry) => entry?.episodes).filter(Boolean)[0]
      : null;

    items.push({
      type,
      label: themeDisplayLabel(theme, fallbackIndex),
      songTitle,
      artistText,
      episodes,
      videoLink: firstVideoLink(theme),
    });
  }

  return items;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animethemes')
    .setDescription('Find anime opening/ending themes and direct video links')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Anime title to search')
        .setRequired(true)
        .setMaxLength(120),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Theme type')
        .setRequired(false)
        .addChoices(
          { name: 'Openings', value: 'openings' },
          { name: 'Endings', value: 'endings' },
          { name: 'Both', value: 'both' },
        ),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('links')
        .setDescription('Include direct AnimeThemes video links')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title', true).trim();
    const type = interaction.options.getString('type') ?? 'openings';
    const includeLinks = interaction.options.getBoolean('links') ?? true;

    try {
      const searchUrl = `${ANIMETHEMES_API}/anime?filter[search]=${encodeURIComponent(title)}&page[size]=1&include=images,animethemes.song.artists,animethemes.animethemeentries.videos`;
      const search = await fetchJson(searchUrl);
      const anime = getAnimeResults(search)[0];

      if (!anime) {
        await interaction.editReply(`No anime found for \`${title}\`.`);
        return;
      }

      const themeItems = extractThemeItems(anime, type);
      const lines = themeItems
        .slice(0, 12)
        .map((item) => {
          const parts = [`**${item.label}:** ${item.songTitle}`];
          if (item.artistText) parts.push(`by ${item.artistText}`);
          if (item.episodes) parts.push(`(${item.episodes})`);
          return parts.join(' ');
        });

      const animeName = anime?.name || anime?.title || title;
      const animeUrl = anime?.slug ? `${ANIMETHEMES_SITE}/anime/${anime.slug}` : ANIMETHEMES_SITE;

      if (!lines.length) {
        await interaction.editReply(`I found **${animeName}**, but no ${type === 'both' ? 'theme' : type} data was available.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Anime Themes: ${animeName}`)
        .setURL(animeUrl)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setColor(0x22c55e)
        .setFooter({ text: 'Data from AnimeThemes.moe' });

      if (includeLinks) {
        const linkLines = themeItems
          .filter((item) => Boolean(item.videoLink))
          .slice(0, 5)
          .map((item) => `[${item.label} video](${item.videoLink})`);

        if (linkLines.length) {
          embed.addFields({
            name: 'Video Links',
            value: linkLines.join(' • ').slice(0, 1024),
          });
        }
      }

      const imageUrl = Array.isArray(anime?.images)
        ? anime.images.map((img) => img?.link).find(Boolean)
        : null;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      const primaryVideo = includeLinks
        ? themeItems.map((item) => item.videoLink).find(Boolean)
        : null;

      await interaction.editReply({
        content: primaryVideo ? `Featured theme video: ${primaryVideo}` : undefined,
        embeds: [embed],
      });
    } catch (err) {
      console.error('[animethemes]', err);
      await interaction.editReply('Failed to fetch anime themes right now. Try again in a moment.');
    }
  },
};