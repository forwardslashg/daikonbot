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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animeopening')
    .setDescription('Find opening/ending themes for an anime')
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
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title', true).trim();
    const type = interaction.options.getString('type') ?? 'openings';

    try {
      const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
      const search = await fetchJson(searchUrl);
      const anime = search?.data?.[0];

      if (!anime) {
        await interaction.editReply(`No anime found for \`${title}\`.`);
        return;
      }

      const themes = await fetchJson(`https://api.jikan.moe/v4/anime/${anime.mal_id}/themes`);
      const openings = themes?.data?.openings ?? [];
      const endings = themes?.data?.endings ?? [];

      let lines = [];
      if (type === 'openings' || type === 'both') {
        lines = lines.concat(openings.slice(0, 10).map((item, i) => `**OP ${i + 1}:** ${item}`));
      }
      if (type === 'endings' || type === 'both') {
        lines = lines.concat(endings.slice(0, 10).map((item, i) => `**ED ${i + 1}:** ${item}`));
      }

      if (!lines.length) {
        await interaction.editReply(`I found **${anime.title}**, but no ${type === 'both' ? 'theme' : type} data was available.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Anime Themes: ${anime.title}`)
        .setURL(anime.url)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setColor(0x22c55e)
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      if (anime.images?.jpg?.image_url) {
        embed.setThumbnail(anime.images.jpg.image_url);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[animeopening]', err);
      await interaction.editReply('Failed to fetch anime themes right now. Try again in a moment.');
    }
  },
};