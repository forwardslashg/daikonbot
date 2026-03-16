const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

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

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[animetop]', err);
      await interaction.editReply('Failed to fetch the top anime list right now. Try again in a moment.');
    }
  },
};
