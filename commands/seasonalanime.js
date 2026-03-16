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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seasonalanime')
    .setDescription('Browse current or upcoming seasonal anime')
    .addStringOption((opt) =>
      opt
        .setName('season')
        .setDescription('Which seasonal list to show')
        .setRequired(false)
        .addChoices(
          { name: 'Current Season', value: 'now' },
          { name: 'Upcoming Season', value: 'upcoming' },
        ),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('count')
        .setDescription('How many entries to show (1-10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const season = interaction.options.getString('season') ?? 'now';
    const count = interaction.options.getInteger('count') ?? 5;

    try {
      const endpoint = season === 'upcoming' ? 'upcoming' : 'now';
      const response = await fetchJson(`https://api.jikan.moe/v4/seasons/${endpoint}?limit=${count}`);
      const animeList = response?.data?.slice(0, count) ?? [];

      if (!animeList.length) {
        await interaction.editReply('No seasonal anime data is available right now.');
        return;
      }

      const lines = animeList.map((anime, index) => {
        const score = anime.score ? `${anime.score}/10` : 'N/A';
        const episodes = anime.episodes ? `${anime.episodes} eps` : '?? eps';
        const synopsis = trim(anime.synopsis?.replace(/\s+/g, ' '), 110) ?? 'No synopsis available.';
        return `**${index + 1}. ${anime.title}**\nScore: ${score} | ${episodes}\n${synopsis}`;
      });

      const topAnime = animeList[0];
      const embed = new EmbedBuilder()
        .setTitle(season === 'upcoming' ? 'Upcoming Seasonal Anime' : 'Current Seasonal Anime')
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setColor(0xec4899)
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = topAnime?.images?.jpg?.image_url;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[seasonalanime]', err);
      await interaction.editReply('Failed to fetch seasonal anime right now. Try again in a moment.');
    }
  },
};