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
    .setName('animecharacter')
    .setDescription('Look up an anime character')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Character name')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const name = interaction.options.getString('name', true).trim();

    try {
      const search = await fetchJson(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(name)}&limit=1`);
      const found = search?.data?.[0];

      if (!found) {
        await interaction.editReply(`No character found for \`${name}\`.`);
        return;
      }

      const full = await fetchJson(`https://api.jikan.moe/v4/characters/${found.mal_id}/full`);
      const character = full?.data ?? found;

      const animeNames = (character?.anime ?? [])
        .slice(0, 5)
        .map((a) => a?.anime?.title)
        .filter(Boolean);

      const embed = new EmbedBuilder()
        .setTitle(character.name)
        .setURL(character.url ?? found.url)
        .setDescription(trim(character.about?.replace(/\n{3,}/g, '\n\n'), 1200) ?? 'No biography available.')
        .setColor(0x3b82f6)
        .addFields(
          { name: 'Favorites', value: String(character.favorites ?? 0), inline: true },
          {
            name: 'Appears In',
            value: animeNames.length ? animeNames.join(', ') : 'No anime list available',
            inline: false,
          },
        )
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = character.images?.jpg?.image_url ?? found.images?.jpg?.image_url;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[animecharacter]', err);
      await interaction.editReply('Failed to fetch character info right now. Try again in a moment.');
    }
  },
};