const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Weather API request failed (${res.status})`);
  }

  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Get current weather for a city')
    .addStringOption((opt) =>
      opt
        .setName('location')
        .setDescription('City or location name')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const location = interaction.options.getString('location', true).trim();

    try {
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
      const data = await fetchJson(url);

      const current = data?.current_condition?.[0];
      const nearest = data?.nearest_area?.[0];

      if (!current || !nearest) {
        await interaction.editReply('Could not find weather data for that location.');
        return;
      }

      const areaName = nearest?.areaName?.[0]?.value ?? location;
      const region = nearest?.region?.[0]?.value;
      const country = nearest?.country?.[0]?.value;
      const resolved = [areaName, region, country].filter(Boolean).join(', ');

      const embed = new EmbedBuilder()
        .setTitle(`Weather: ${resolved}`)
        .setDescription(current.weatherDesc?.[0]?.value ?? 'No description')
        .addFields(
          { name: 'Temperature', value: `${current.temp_C} C (${current.temp_F} F)`, inline: true },
          { name: 'Feels Like', value: `${current.FeelsLikeC} C (${current.FeelsLikeF} F)`, inline: true },
          { name: 'Humidity', value: `${current.humidity}%`, inline: true },
          { name: 'Wind', value: `${current.windspeedKmph} km/h ${current.winddir16Point ?? ''}`.trim(), inline: true },
          { name: 'Cloud Cover', value: `${current.cloudcover}%`, inline: true },
          { name: 'Visibility', value: `${current.visibility} km`, inline: true },
        )
        .setColor(0x0ea5e9)
        .setFooter({ text: 'Data from wttr.in' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[weather]', err);
      await interaction.editReply('Failed to fetch weather right now. Try again later.');
    }
  },
};