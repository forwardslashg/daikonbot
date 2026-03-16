const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const DICE_REGEX = /^(\d+)d(\d+)([+-]\d+)?$/i;
const MAX_DICE = 100;
const MAX_SIDES = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice using XdY notation (e.g. 2d6, 1d20+5).')
    .addStringOption((opt) =>
      opt
        .setName('dice')
        .setDescription('Dice expression, e.g. 2d6, 1d20+5, 4d8-2.')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const input = (interaction.options.getString('dice') ?? '1d6').trim();
    const match = input.match(DICE_REGEX);

    if (!match) {
      return interaction.reply({
        content: `Invalid format. Use something like \`2d6\`, \`1d20+5\`, or \`4d8-2\`.`,
        ephemeral: true,
      });
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    if (count < 1 || count > MAX_DICE) {
      return interaction.reply({
        content: `Number of dice must be between 1 and ${MAX_DICE}.`,
        ephemeral: true,
      });
    }
    if (sides < 2 || sides > MAX_SIDES) {
      return interaction.reply({
        content: `Sides must be between 2 and ${MAX_SIDES}.`,
        ephemeral: true,
      });
    }

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const subtotal = rolls.reduce((a, b) => a + b, 0);
    const total = subtotal + modifier;

    const modStr = modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
    const rollsDisplay = rolls.length <= 20 ? `[${rolls.join(', ')}]` : `[${rolls.slice(0, 20).join(', ')} …+${rolls.length - 20} more]`;

    const isNat20 = count === 1 && sides === 20 && rolls[0] === 20;
    const isNat1  = count === 1 && sides === 20 && rolls[0] === 1;

    const embed = new EmbedBuilder()
      .setTitle(isNat20 ? '🎉 Natural 20!' : isNat1 ? '💀 Natural 1…' : `🎲 ${input}`)
      .addFields(
        { name: 'Rolls', value: rollsDisplay, inline: false },
        { name: modifier !== 0 ? `Total (${subtotal}${modStr})` : 'Total', value: `**${total}**`, inline: true },
      )
      .setColor(isNat20 ? 0x22c55e : isNat1 ? 0xef4444 : 0x8b5cf6);

    await interaction.reply({ embeds: [embed] });
  },
};
