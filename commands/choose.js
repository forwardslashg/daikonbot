const { SlashCommandBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

function parseChoices(input) {
  return input
    .split(/[\n,|]/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Pick one option from a list.')
    .addStringOption((opt) =>
      opt
        .setName('options')
        .setDescription('Comma, line, or | separated options')
        .setRequired(true)
        .setMaxLength(800),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const raw = interaction.options.getString('options', true);
    const choices = parseChoices(raw);

    if (choices.length < 2) {
      await interaction.reply({
        content: 'Give me at least 2 options. Example: `pizza, ramen, tacos`',
        ephemeral: true,
      });
      return;
    }

    const picked = choices[Math.floor(Math.random() * choices.length)];
    await interaction.reply(`I pick: **${picked}**`);
  },
};
