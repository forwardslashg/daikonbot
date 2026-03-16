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
    .setName('randomanime')
    .setDescription('Get a random anime recommendation')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const response = await fetchJson('https://api.jikan.moe/v4/random/anime');
      const anime = response?.data;

      if (!anime) {
        await interaction.editReply('Could not find a random anime right now.');
        return;
      }

      const genres = (anime.genres ?? []).slice(0, 4).map((genre) => genre.name).filter(Boolean);
      const score = anime.score ? `${anime.score}/10` : 'N/A';
      const episodes = anime.episodes ? String(anime.episodes) : 'Unknown';

      const embed = new EmbedBuilder()
        .setTitle(`Random Anime: ${anime.title}`)
        .setURL(anime.url)
        .setDescription(trim(anime.synopsis?.replace(/\n{3,}/g, '\n\n'), 1200) ?? 'No synopsis available.')
        .setColor(0x8b5cf6)
        .addFields(
          { name: 'Type', value: anime.type ?? 'Unknown', inline: true },
          { name: 'Episodes', value: episodes, inline: true },
          { name: 'Score', value: score, inline: true },
          { name: 'Status', value: anime.status ?? 'Unknown', inline: true },
          { name: 'Genres', value: genres.length ? genres.join(', ') : 'No genres listed', inline: false },
        )
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[randomanime]', err);
      await interaction.editReply('Failed to fetch a random anime right now. Try again in a moment.');
    }
  },
};