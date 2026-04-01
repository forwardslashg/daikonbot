const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const ANIMETHEMES_API = 'https://api.animethemes.moe';
const ANIMETHEMES_SITE = 'https://animethemes.moe';
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'DaikonBot/1.0 (+https://github.com/forwardslashg/daikonbot)',
  Referer: 'https://animethemes.moe/',
};

async function fetchJson(url, options = {}) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  return res.json();
}

async function fetchAnimeBySlug(slug, includes) {
  const payload = await fetchJson(
    `${ANIMETHEMES_API}/anime/${encodeURIComponent(slug)}?include=${encodeURIComponent(includes)}`,
    { headers: REQUEST_HEADERS, timeoutMs: 9000 },
  );

  if (Array.isArray(payload?.anime) && payload.anime.length) return payload.anime[0];
  if (payload?.anime && typeof payload.anime === 'object') return payload.anime;
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return null;
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

async function searchAnimeRest(title) {
  const rawTitle = String(title ?? '').trim();
  const slug = titleToSlug(rawTitle);
  const includes = 'images,animethemes,animethemes.song,animethemes.song.artists,animethemes.animethemeentries,animethemes.animethemeentries.videos';
  const startedAt = Date.now();
  const hardDeadlineMs = 20000;

  console.info(`[animethemes] REST search start title="${rawTitle}" slug="${slug}"`);

  // Try direct slug endpoint first. This is usually the fastest and most accurate.
  if (slug) {
    try {
      const slugAnime = await fetchAnimeBySlug(slug, includes);
      if (slugAnime) return slugAnime;
      console.info('[animethemes] Slug lookup returned no anime.');
    } catch {
      console.info('[animethemes] Slug lookup failed, trying query search.');
    }
  }

  const queryCandidates = [
    `${ANIMETHEMES_API}/anime?q=${encodeURIComponent(rawTitle)}&page[size]=30`,
    `${ANIMETHEMES_API}/anime?search=${encodeURIComponent(rawTitle)}&page[size]=30`,
  ];

  let lastError = null;
  for (const searchUrl of queryCandidates) {
    if (Date.now() - startedAt > hardDeadlineMs) {
      console.warn('[animethemes] Search deadline reached during query candidates.');
      break;
    }

    try {
      console.info(`[animethemes] Query candidate: ${searchUrl}`);
      const payload = await fetchJson(searchUrl, { headers: REQUEST_HEADERS, timeoutMs: 7000 });
      const animeList = getAnimeResults(payload);
      const best = pickBestAnimeMatch(animeList, rawTitle);
      if (best) {
        const bestSlug = animeSlug(best);
        console.info(`[animethemes] Query match found name="${animeName(best)}" slug="${bestSlug}"`);
        if (bestSlug) {
          try {
            const hydrated = await fetchAnimeBySlug(bestSlug, includes);
            if (hydrated) return hydrated;
          } catch (err) {
            console.info(`[animethemes] Hydration by slug failed for ${bestSlug}: ${err?.message || err}`);
          }
        }
        return best;
      }
    } catch (err) {
      console.warn(`[animethemes] Query candidate failed: ${err?.message || err}`);
      lastError = err;
    }
  }

  // Final fallback: scan catalog pages without heavy includes, then hydrate one match.
  let bestOverall = null;
  let bestOverallScore = 0;
  for (let page = 1; page <= 40; page += 1) {
    if (Date.now() - startedAt > hardDeadlineMs) {
      console.warn(`[animethemes] Search deadline reached while scanning page ${page}.`);
      break;
    }

    const searchUrl = `${ANIMETHEMES_API}/anime?page[size]=100&page[number]=${page}`;
    try {
      const payload = await fetchJson(searchUrl, { headers: REQUEST_HEADERS, timeoutMs: 7000 });
      const animeList = getAnimeResults(payload);
      if (!animeList.length) break;

      const normalizedNeedle = normalizeText(rawTitle);
      const slugNeedle = titleToSlug(rawTitle);
      for (const anime of animeList) {
        const score = scoreAnimeMatch(anime, rawTitle, normalizedNeedle, slugNeedle);
        if (score > bestOverallScore) {
          bestOverall = anime;
          bestOverallScore = score;
        }
      }

      if (bestOverallScore >= 110) {
        const quickSlug = animeSlug(bestOverall);
        if (quickSlug) {
          const hydrated = await fetchAnimeBySlug(quickSlug, includes).catch(() => null);
          if (hydrated) return hydrated;
        }
        return bestOverall;
      }
    } catch (err) {
      console.warn(`[animethemes] Paged scan failed on page ${page}: ${err?.message || err}`);
      lastError = err;
      break;
    }
  }

  if (bestOverall && bestOverallScore >= 70) {
    const finalSlug = animeSlug(bestOverall);
    console.info(`[animethemes] Returning best fuzzy match score=${bestOverallScore} name="${animeName(bestOverall)}" slug="${finalSlug}"`);
    if (finalSlug) {
      try {
        const hydrated = await fetchAnimeBySlug(finalSlug, includes);
        if (hydrated) return hydrated;
      } catch (err) {
        console.info(`[animethemes] Final hydration failed for ${finalSlug}: ${err?.message || err}`);
      }
    }
    return bestOverall;
  }

  console.warn(`[animethemes] No anime found after ${Date.now() - startedAt}ms for title="${rawTitle}"`);
  if (lastError) throw lastError;
  return null;
}

function buildVideoNavRow(prefix, userId, index, total, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}|prev|${userId}`)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || index <= 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}|next|${userId}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || index >= total - 1),
  );
}

function videoLinkLine(item, index, total) {
  return `Video ${index + 1}/${total} • ${item.label} • ${item.songTitle}\n${item.videoLink}`;
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
    const startedAt = Date.now();

    console.info(`[animethemes] Command start user=${interaction.user.id} title="${title}" type=${type} includeLinks=${includeLinks}`);

    try {
      // GraphQL endpoint behavior has been unstable; use REST for predictable results.
      const anime = await searchAnimeRest(title);

      if (!anime) {
        console.info(`[animethemes] No anime resolved title="${title}" elapsedMs=${Date.now() - startedAt}`);
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
        console.info(`[animethemes] Anime resolved but no themes anime="${resolvedAnimeName}" type=${type} elapsedMs=${Date.now() - startedAt}`);
        await interaction.editReply(`I found **${resolvedAnimeName}**, but no ${type === 'both' ? 'theme' : type} data was available.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Anime Themes: ${resolvedAnimeName}`)
        .setURL(animeUrl)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setColor(0x22c55e)
        .setFooter({ text: 'Data from AnimeThemes.moe' });

      const imageUrl = Array.isArray(anime?.images)
        ? anime.images.map((img) => img?.link).find(Boolean)
        : Array.isArray(anime?.attributes?.images)
          ? anime.attributes.images.map((img) => img?.link).find(Boolean)
        : null;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({
        embeds: [embed],
      });

      console.info(`[animethemes] Embed sent anime="${resolvedAnimeName}" themes=${themeItems.length} elapsedMs=${Date.now() - startedAt}`);

      if (!includeLinks) return;

      const videoItems = themeItems.filter((item) => Boolean(item.videoLink));
      if (!videoItems.length) return;

      let currentIndex = 0;
      const navPrefix = `animethemes_nav:${interaction.id}`;

      const navMessage = await interaction.followUp({
        content: videoLinkLine(videoItems[currentIndex], currentIndex, videoItems.length),
        components: [buildVideoNavRow(navPrefix, interaction.user.id, currentIndex, videoItems.length)],
        fetchReply: true,
      });

      console.info(`[animethemes] Link navigator sent links=${videoItems.length} elapsedMs=${Date.now() - startedAt}`);

      if (videoItems.length <= 1) return;

      const collector = navMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
      });

      collector.on('collect', async (btnInteraction) => {
        const [prefix, action, ownerId] = btnInteraction.customId.split('|');

        if (prefix !== navPrefix || ownerId !== interaction.user.id) {
          await btnInteraction.reply({ content: "This video navigator isn't for you.", ephemeral: true });
          return;
        }

        if (btnInteraction.user.id !== interaction.user.id) {
          await btnInteraction.reply({ content: "Only the command user can use these buttons.", ephemeral: true });
          return;
        }

        if (action === 'prev') {
          currentIndex = Math.max(0, currentIndex - 1);
        } else if (action === 'next') {
          currentIndex = Math.min(videoItems.length - 1, currentIndex + 1);
        }

        await btnInteraction.update({
          content: videoLinkLine(videoItems[currentIndex], currentIndex, videoItems.length),
          components: [buildVideoNavRow(navPrefix, interaction.user.id, currentIndex, videoItems.length)],
        });
      });

      collector.on('end', async () => {
        try {
          await navMessage.edit({
            components: [buildVideoNavRow(navPrefix, interaction.user.id, currentIndex, videoItems.length, true)],
          });
        } catch {
          // Ignore if message was deleted or already edited.
        }
      });
    } catch (err) {
      console.error('[animethemes]', err);
      await interaction.editReply('Failed to fetch anime themes right now. Try again in a moment.');
    }
  },
};