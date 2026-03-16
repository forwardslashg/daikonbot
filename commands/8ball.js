const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

const RESPONSES = [
  // Positive
  { text: 'It is certain.',            color: 0x22c55e },
  { text: 'It is decidedly so.',        color: 0x22c55e },
  { text: 'Without a doubt.',           color: 0x22c55e },
  { text: 'Yes, definitely.',           color: 0x22c55e },
  { text: 'You may rely on it.',        color: 0x22c55e },
  { text: 'As I see it, yes.',          color: 0x22c55e },
  { text: 'Most likely.',               color: 0x22c55e },
  { text: 'Outlook good.',              color: 0x22c55e },
  { text: 'Yes.',                       color: 0x22c55e },
  { text: 'Signs point to yes.',        color: 0x22c55e },
  // Neutral
  { text: 'Reply hazy, try again.',     color: 0xf59e0b },
  { text: 'Ask again later.',           color: 0xf59e0b },
  { text: 'Better not tell you now.',   color: 0xf59e0b },
  { text: 'Cannot predict now.',        color: 0xf59e0b },
  { text: 'Concentrate and ask again.', color: 0xf59e0b },
  // Negative
  { text: "Don't count on it.",         color: 0xef4444 },
  { text: 'My reply is no.',            color: 0xef4444 },
  { text: 'My sources say no.',         color: 0xef4444 },
  { text: 'Outlook not so good.',       color: 0xef4444 },
  { text: 'Very doubtful.',             color: 0xef4444 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question.')
    .addStringOption((opt) =>
      opt
        .setName('question')
        .setDescription('Your yes/no question.')
        .setRequired(true),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];

    const embed = new EmbedBuilder()
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: 'Question', value: question },
        { name: 'Answer', value: `**${response.text}**` },
      )
      .setColor(response.color);

    await interaction.reply({ embeds: [embed] });
  },
};
