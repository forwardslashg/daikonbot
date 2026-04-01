const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const ANIMETHEMES_API = 'https://api.animethemes.moe';
const ANIMETHEMES_GRAPHQL_ENDPOINTS = [
  'https://graphql.animethemes.moe/graphql',
  'https://graphql.animethemes.moe/graphql/',
];
const ANIMETHEMES_SITE = 'https://animethemes.moe';
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'DaikonBot/1.0 (+https://github.com/forwardslashg/daikonbot)',
  Referer: 'https://animethemes.moe/',
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  return res.json();
}

function getAnimeResults(payload) {
  if (Array.isArray(payload?.anime)) return payload.anime;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleToSlug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function animeName(anime) {
  return String(anime?.name ?? anime?.title ?? anime?.attributes?.name ?? '').trim();
}

function animeSlug(anime) {
  return String(anime?.slug ?? anime?.attributes?.slug ?? '').trim();
}

function scoreAnimeMatch(anime, title, normalizedNeedle, slugNeedle) {
  const rawName = animeName(anime);
  if (!rawName) return 0;

  const normalizedName = normalizeText(rawName);
  if (!normalizedName) return 0;

  const normalizedTitle = normalizeText(title);
  const slug = titleToSlug(animeSlug(anime) || rawName);

  if (slugNeedle && slug === slugNeedle) return 120;
  if (normalizedName === normalizedNeedle) return 110;
  if (normalizedName === normalizedTitle) return 100;
  if (normalizedName.startsWith(`${normalizedNeedle} `)) return 90;
  if (normalizedName.includes(normalizedNeedle)) return 80;

  const needleParts = normalizedNeedle.split(' ').filter(Boolean);
  if (needleParts.length && needleParts.every((part) => normalizedName.includes(part))) return 70;

  return 0;
}

function pickBestAnimeMatch(animeList, title) {
  const normalizedNeedle = normalizeText(title);
  const slugNeedle = titleToSlug(title);
  let best = null;
  let bestScore = 0;

  for (const anime of animeList) {
    const score = scoreAnimeMatch(anime, title, normalizedNeedle, slugNeedle);
    if (score > bestScore) {
      best = anime;
      bestScore = score;
    }
  }

  return best;
}

function extractAnimeFromGraphQLPayload(payload) {
  const data = payload?.data ?? {};

  if (Array.isArray(data?.anime?.data)) return data.anime.data;
  if (data?.anime?.data && typeof data.anime.data === 'object') return [data.anime.data];
  if (Array.isArray(data?.searchAnime?.data)) return data.searchAnime.data;
  if (Array.isArray(data?.anime)) return data.anime;
  if (Array.isArray(data?.anime?.nodes)) return data.anime.nodes;
  if (Array.isArray(data?.searchAnime)) return data.searchAnime;
  if (Array.isArray(data?.searchAnime?.nodes)) return data.searchAnime.nodes;
  if (Array.isArray(data?.anime?.edges)) return data.anime.edges.map((e) => e?.node).filter(Boolean);
  if (Array.isArray(data?.searchAnime?.edges)) return data.searchAnime.edges.map((e) => e?.node).filter(Boolean);

  return [];
}

async function postGraphQL(endpoint, query, variables) {
  try {
    return await fetchJson(endpoint, {
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    if (!String(err?.message ?? '').includes('(405)')) {
      throw err;
    }

    // Some GraphQL gateways only allow GET for simple operations.
    const params = new URLSearchParams({
      query,
      variables: JSON.stringify(variables ?? {}),
    });
    return fetchJson(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      headers: REQUEST_HEADERS,
    });
  }
}

async function searchAnimeGraphQL(title) {
  const queries = [
    `
      query SearchAnime($search: String!) {
        anime(search: $search, first: 1) {
          nodes {
            name
            slug
            images { link }
            animethemes {
              type
              sequence
              song {
                title
                artists { name }
              }
              animethemeentries {
                episodes
                videos { link }
              }
            }
          }
        }
      }
    `,
    `
      query SearchAnime($search: String!) {
        anime(search: $search, first: 1) {
          name
          slug
          images { link }
          animethemes {
            type
            sequence
            song {
              title
              artists { name }
            }
            animethemeentries {
              episodes
              videos { link }
            }
          }
        }
      }
    `,
    `
      query SearchAnime($search: String!) {
        anime(search: $search, limit: 1) {
          data {
            name
            slug
            images { link }
            animethemes {
              type
              sequence
              song {
                title
                artists { name }
              }
              animethemeentries {
                episodes
                videos { link }
              }
            }
          }
        }
      }
    `,
    `
      query SearchAnime($search: String!) {
        searchAnime(search: $search, first: 1) {
          nodes {
            name
            slug
            images { link }
            animethemes {
              type
              sequence
              song {
                title
                artists { name }
              }
              animethemeentries {
                episodes
                videos { link }
              }
            }
          }
        }
      }
    `,
    `
      query SearchAnime($search: String!) {
        anime(search: $search) {
          edges {
            node {
              name
              slug
              images { link }
              animethemes {
                type
                sequence
                song {
                  title
                  artists { name }
                }
                animethemeentries {
                  episodes
                  videos { link }
                }
              }
            }
          }
        }
      }
    `,
  ];

  let lastError = null;
  for (const endpoint of ANIMETHEMES_GRAPHQL_ENDPOINTS) {
    for (const query of queries) {
      try {
        const payload = await postGraphQL(endpoint, query, { search: title });

        if (Array.isArray(payload?.errors) && payload.errors.length) {
          lastError = new Error(payload.errors.map((e) => e?.message).filter(Boolean).join(' | ') || 'GraphQL query failed.');
          continue;
        }

        const anime = extractAnimeFromGraphQLPayload(payload)[0];
        if (anime) return anime;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function searchAnimeRest(title) {
  const rawTitle = String(title ?? '').trim();
  const slug = titleToSlug(rawTitle);
  const includes = 'images,animethemes,animethemes.song,animethemes.song.artists,animethemes.animethemeentries,animethemes.animethemeentries.videos';

  // Try direct slug endpoint first. This is usually the fastest and most accurate.
  if (slug) {
    try {
      const slugPayload = await fetchJson(`${ANIMETHEMES_API}/anime/${encodeURIComponent(slug)}?include=${encodeURIComponent(includes)}`, {
        headers: REQUEST_HEADERS,
      });
      const slugAnime = Array.isArray(slugPayload?.anime)
        ? slugPayload.anime[0]
        : slugPayload?.anime || slugPayload?.data || null;
      if (slugAnime) return slugAnime;
    } catch {
      // Ignore and continue through other search strategies.
    }
  }

  const queryCandidates = [
    `${ANIMETHEMES_API}/anime?filter[name]=${encodeURIComponent(rawTitle)}&include=${encodeURIComponent(includes)}&page[size]=10`,
    `${ANIMETHEMES_API}/anime?filter[slug]=${encodeURIComponent(slug)}&include=${encodeURIComponent(includes)}&page[size]=10`,
    `${ANIMETHEMES_API}/anime?filter[search]=${encodeURIComponent(rawTitle)}&include=${encodeURIComponent(includes)}&page[size]=10`,
    `${ANIMETHEMES_API}/anime?q=${encodeURIComponent(rawTitle)}&include=${encodeURIComponent(includes)}&page[size]=10`,
  ];

  let lastError = null;
  for (const searchUrl of queryCandidates) {
    try {
      const payload = await fetchJson(searchUrl, { headers: REQUEST_HEADERS });
      const animeList = getAnimeResults(payload);
      const best = pickBestAnimeMatch(animeList, rawTitle);
      if (best) return best;
    } catch (err) {
      lastError = err;
    }
  }

  // Final fallback: scan more catalog pages and pick the best fuzzy match.
  for (let page = 1; page <= 20; page += 1) {
    const searchUrl = `${ANIMETHEMES_API}/anime?page[size]=25&page[number]=${page}&include=${encodeURIComponent(includes)}`;
    try {
      const payload = await fetchJson(searchUrl, { headers: REQUEST_HEADERS });
      const animeList = getAnimeResults(payload);
      if (!animeList.length) break;

      const best = pickBestAnimeMatch(animeList, rawTitle);
      if (best) return best;
    } catch (err) {
      lastError = err;
      break;
    }
  }

  if (lastError) throw lastError;
  return null;
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
      let anime = null;
      try {
        anime = await searchAnimeGraphQL(title);
      } catch (graphqlErr) {
        console.warn('[animethemes] GraphQL lookup failed, falling back to REST:', graphqlErr?.message || graphqlErr);
      }

      if (!anime) {
        anime = await searchAnimeRest(title);
      }

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

      const resolvedAnimeName = animeName(anime) || title;
      const resolvedAnimeSlug = animeSlug(anime);
      const animeUrl = resolvedAnimeSlug ? `${ANIMETHEMES_SITE}/anime/${resolvedAnimeSlug}` : ANIMETHEMES_SITE;

      if (!lines.length) {
        await interaction.editReply(`I found **${resolvedAnimeName}**, but no ${type === 'both' ? 'theme' : type} data was available.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Anime Themes: ${resolvedAnimeName}`)
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
        : Array.isArray(anime?.attributes?.images)
          ? anime.attributes.images.map((img) => img?.link).find(Boolean)
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