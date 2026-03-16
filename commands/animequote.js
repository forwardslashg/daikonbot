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
    .setName('animequote')
    .setDescription('Get a random anime quote')
    .addStringOption((opt) =>
      opt
        .setName('anime')
        .setDescription('Anime title to get a quote from (optional)')
        .setRequired(false)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const animeFilter = interaction.options.getString('anime')?.trim();

    try {
      let quoteData;

      if (animeFilter) {
        const res = await fetchJson(
          `https://api.animechan.io/v1/quotes/random?anime=${encodeURIComponent(animeFilter)}`,
        );
        const list = res?.data;
        if (!list?.length) {
          await interaction.editReply(`No quotes found for \`${animeFilter}\`.`);
          return;
        }
        quoteData = list[Math.floor(Math.random() * list.length)];
      } else {
        const res = await fetchJson('https://api.animechan.io/v1/quotes/random');
        quoteData = res?.data;
      }

      if (!quoteData?.content) {
        await interaction.editReply('Could not retrieve a quote right now. Try again in a moment.');
        return;
      }

      const characterName = quoteData.character?.name ?? 'Unknown';
      const animeName = quoteData.anime?.name ?? 'Unknown';

      const embed = new EmbedBuilder()
        .setDescription(`> ${quoteData.content}`)
        .setColor(0x6366f1)
        .addFields(
          { name: 'Character', value: characterName, inline: true },
          { name: 'Anime', value: animeName, inline: true },
        )
        .setFooter({ text: 'Data from Animechan' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[animequote]', err);
      await interaction.editReply('Failed to fetch a quote right now. Try again in a moment.');
    }
  },
};
