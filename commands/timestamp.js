const { SlashCommandBuilder, EmbedBuilder, time, TimestampStyles } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Convert a date/time into Discord timestamp tags.')
    .addStringOption((opt) =>
      opt
        .setName('datetime')
        .setDescription('Date/time string, e.g. "2026-12-25", "2026-12-25 18:00", "tomorrow". Defaults to now.')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const input = interaction.options.getString('datetime');
    let date;

    if (!input || input.toLowerCase() === 'now') {
      date = new Date();
    } else if (input.toLowerCase() === 'tomorrow') {
      date = new Date(Date.now() + 86_400_000);
    } else if (input.toLowerCase() === 'yesterday') {
      date = new Date(Date.now() - 86_400_000);
    } else {
      date = new Date(input);
    }

    if (isNaN(date.getTime())) {
      return interaction.reply({
        content: `Couldn't parse **${input}** as a date. Try formats like \`2026-12-25\` or \`2026-12-25 18:00\`.`,
        ephemeral: true,
      });
    }

    const unix = Math.floor(date.getTime() / 1000);

    const styles = [
      { label: 'Short Time',       tag: `<t:${unix}:t>`, style: TimestampStyles.ShortTime },
      { label: 'Long Time',        tag: `<t:${unix}:T>`, style: TimestampStyles.LongTime },
      { label: 'Short Date',       tag: `<t:${unix}:d>`, style: TimestampStyles.ShortDate },
      { label: 'Long Date',        tag: `<t:${unix}:D>`, style: TimestampStyles.LongDate },
      { label: 'Short Date/Time',  tag: `<t:${unix}:f>`, style: TimestampStyles.ShortDateTime },
      { label: 'Long Date/Time',   tag: `<t:${unix}:F>`, style: TimestampStyles.LongDateTime },
      { label: 'Relative',         tag: `<t:${unix}:R>`, style: TimestampStyles.RelativeTime },
    ];

    const embed = new EmbedBuilder()
      .setTitle('🕐 Timestamp Tags')
      .setDescription(`Unix epoch: \`${unix}\``)
      .addFields(
        styles.map(({ label, tag, style }) => ({
          name: label,
          value: `${time(date, style)} — \`${tag}\``,
          inline: false,
        })),
      )
      .setColor(0x8b5cf6);

    await interaction.reply({ embeds: [embed] });
  },
};
