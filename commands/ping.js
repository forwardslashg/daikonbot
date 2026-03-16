const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and API response time.')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging…', fetchReply: true });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsHeartbeat = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'Roundtrip', value: `${roundtrip} ms`, inline: true },
        { name: 'WS Heartbeat', value: `${wsHeartbeat} ms`, inline: true },
      )
      .setColor(roundtrip < 200 ? 0x22c55e : roundtrip < 500 ? 0xf59e0b : 0xef4444);

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
