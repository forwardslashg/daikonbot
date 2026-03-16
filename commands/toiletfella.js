const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

// Shared install/context settings applied to every command.
// Since all commands are user-installed, the helper is imported by each command file.
const { userInstallConfig } = require('../utils/commandConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toiletfella')
    .setDescription('toilet fella')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const query = encodeURIComponent('toilet bound hanako kun');
      const url = `https://api.klipy.com/v2/search?q=${query}&key=${process.env.KLIPY_API_KEY}&limit=50&media_filter=gif`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`KLIPY API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        await interaction.editReply('you shouldnt see this');
        return;
      }

      const random = data.results[Math.floor(Math.random() * data.results.length)];
      const gifUrl = random.media_formats.gif.url;
      const pageUrl = random.url;

      const embed = new EmbedBuilder()
        .setTitle('Toilet Nigga')
        .setURL(pageUrl)
        .setImage(gifUrl)
        .setColor(0x8b5cf6)
        .setFooter({ text: 'Sponsored by VS SOUND TEAM' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply('Failed to fetch a GIF. Check your KLIPY API key.');
    }
  },
};
