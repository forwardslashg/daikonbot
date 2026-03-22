const ANILIST_API = 'https://graphql.anilist.co';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function anilistRequest(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length)) {
    const message = payload?.errors?.[0]?.message || `AniList API error (${response.status})`;
    throw new Error(message);
  }

  return payload.data;
}

async function getAniListUserOverview(username) {
  const query = `
    query ($name: String) {
      User(name: $name) {
        id
        name
        about
        avatar { large }
        statistics {
          anime {
            count
            episodesWatched
            minutesWatched
            meanScore
            statuses {
              status
              count
            }
          }
        }
        favourites {
          anime {
            nodes {
              id
              title { romaji english }
            }
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, { name: username });
  const user = data?.User;
  if (!user) return null;

  const stats = user.statistics?.anime ?? {};
  const statuses = Array.isArray(stats.statuses) ? stats.statuses : [];

  return {
    id: user.id,
    username: user.name,
    avatar: user.avatar?.large ?? null,
    about: user.about ? user.about.replace(/<[^>]+>/g, '').trim() : null,
    animeStats: {
      totalEntries: stats.count ?? 0,
      episodesWatched: stats.episodesWatched ?? 0,
      minutesWatched: stats.minutesWatched ?? 0,
      meanScore: stats.meanScore ?? null,
      statuses: statuses.map((s) => ({ status: s.status, count: s.count })),
    },
    favourites: (user.favourites?.anime?.nodes ?? []).slice(0, 10).map((node) => ({
      id: node.id,
      title: node.title?.english || node.title?.romaji || 'Unknown title',
    })),
  };
}

async function getAniListWatchingList(username, limit = 10) {
  const safeLimit = clamp(Number(limit) || 10, 1, 25);

  const query = `
    query ($name: String, $type: MediaType, $statuses: [MediaListStatus], $sort: [MediaListSort]) {
      MediaListCollection(userName: $name, type: $type, status_in: $statuses, sort: $sort) {
        lists {
          status
          entries {
            progress
            score
            updatedAt
            media {
              id
              episodes
              meanScore
              genres
              title { romaji english }
              seasonYear
              format
            }
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    name: username,
    type: 'ANIME',
    statuses: ['CURRENT'],
    sort: ['UPDATED_TIME_DESC'],
  });

  const lists = data?.MediaListCollection?.lists ?? [];
  const entries = lists.flatMap((list) => list.entries ?? []).slice(0, safeLimit);

  return entries.map((entry) => ({
    progress: entry.progress ?? 0,
    score: entry.score ?? null,
    updatedAt: entry.updatedAt ?? null,
    title: entry.media?.title?.english || entry.media?.title?.romaji || 'Unknown title',
    episodes: entry.media?.episodes ?? null,
    meanScore: entry.media?.meanScore ?? null,
    format: entry.media?.format ?? null,
    seasonYear: entry.media?.seasonYear ?? null,
    genres: entry.media?.genres ?? [],
  }));
}

async function getAniListRecommendationsByTitle(title, limit = 8) {
  const safeLimit = clamp(Number(limit) || 8, 1, 20);

  const query = `
    query ($search: String, $recPage: Int, $recPerPage: Int) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english }
        recommendations(page: $recPage, perPage: $recPerPage, sort: RATING_DESC) {
          nodes {
            rating
            mediaRecommendation {
              id
              title { romaji english }
              format
              seasonYear
              meanScore
              genres
            }
          }
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    search: title,
    recPage: 1,
    recPerPage: safeLimit,
  });

  const media = data?.Media;
  if (!media) return null;

  const recommendations = (media.recommendations?.nodes ?? [])
    .filter((n) => n?.mediaRecommendation)
    .map((n) => ({
      rating: n.rating ?? null,
      title: n.mediaRecommendation.title?.english || n.mediaRecommendation.title?.romaji || 'Unknown title',
      format: n.mediaRecommendation.format ?? null,
      seasonYear: n.mediaRecommendation.seasonYear ?? null,
      meanScore: n.mediaRecommendation.meanScore ?? null,
      genres: n.mediaRecommendation.genres ?? [],
    }));

  return {
    sourceTitle: media.title?.english || media.title?.romaji || title,
    recommendations,
  };
}

async function getAniListTrendingSeason({ season = null, year = null, limit = 10 } = {}) {
  const now = new Date();
  const safeYear = Number(year) || now.getUTCFullYear();
  const safeLimit = clamp(Number(limit) || 10, 1, 20);

  const normalizedSeason = String(season || '').toUpperCase();
  const month = now.getUTCMonth() + 1;
  const inferredSeason =
    month <= 3 ? 'WINTER'
    : month <= 6 ? 'SPRING'
    : month <= 9 ? 'SUMMER'
    : 'FALL';

  const safeSeason = ['WINTER', 'SPRING', 'SUMMER', 'FALL'].includes(normalizedSeason)
    ? normalizedSeason
    : inferredSeason;

  const query = `
    query ($season: MediaSeason, $year: Int, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, season: $season, seasonYear: $year, sort: TRENDING_DESC) {
          id
          title { romaji english }
          format
          meanScore
          popularity
          genres
          episodes
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    season: safeSeason,
    year: safeYear,
    perPage: safeLimit,
  });

  return {
    season: safeSeason,
    year: safeYear,
    results: (data?.Page?.media ?? []).map((item) => ({
      title: item.title?.english || item.title?.romaji || 'Unknown title',
      format: item.format ?? null,
      meanScore: item.meanScore ?? null,
      popularity: item.popularity ?? null,
      episodes: item.episodes ?? null,
      genres: item.genres ?? [],
    })),
  };
}

module.exports = {
  getAniListUserOverview,
  getAniListWatchingList,
  getAniListRecommendationsByTitle,
  getAniListTrendingSeason,
};
