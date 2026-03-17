const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    `${days}d`,
    `${hours}h`,
    `${minutes}m`,
    `${seconds}s`,
  ].join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show bot uptime and runtime stats.')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const uptime = formatDuration(process.uptime() * 1000);
    const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const embed = new EmbedBuilder()
      .setTitle('Bot Runtime')
      .setColor(0x38bdf8)
      .addFields(
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'WebSocket Ping', value: `${interaction.client.ws.ping} ms`, inline: true },
        { name: 'Memory (RSS)', value: `${memoryMb} MB`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
