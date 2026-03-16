const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Meme API request failed (${res.status})`);
  }

  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a random meme')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const meme = await fetchJson('https://meme-api.com/gimme');

      if (!meme?.url || !meme?.title) {
        await interaction.editReply('Meme server sent an empty response. Try again.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(meme.title.slice(0, 256))
        .setURL(meme.postLink)
        .setImage(meme.url)
        .setColor(0xf59e0b)
        .setFooter({ text: `r/${meme.subreddit} | 👍 ${meme.ups ?? 0}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[meme]', err);
      await interaction.editReply('Could not fetch a meme right now. Try again in a moment.');
    }
  },
};