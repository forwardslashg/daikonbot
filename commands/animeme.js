const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

// Anime-focused subreddits to pull memes from
const ANIME_SUBREDDITS = ['Animemes', 'anime_irl', 'goodanimemes', 'animememes'];

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
    .setName('animeme')
    .setDescription('Get a random anime meme')
    .addStringOption((opt) =>
      opt
        .setName('subreddit')
        .setDescription('Which anime meme subreddit to pull from')
        .setRequired(false)
        .addChoices(
          { name: 'Animemes', value: 'Animemes' },
          { name: 'anime_irl', value: 'anime_irl' },
          { name: 'goodanimemes', value: 'goodanimemes' },
          { name: 'animememes', value: 'animememes' },
        ),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const chosen =
      interaction.options.getString('subreddit') ??
      ANIME_SUBREDDITS[Math.floor(Math.random() * ANIME_SUBREDDITS.length)];

    try {
      const meme = await fetchJson(`https://meme-api.com/gimme/${encodeURIComponent(chosen)}`);

      if (!meme?.url || !meme?.title) {
        await interaction.editReply('Could not fetch an anime meme right now. Try again in a moment.');
        return;
      }

      if (meme.nsfw) {
        await interaction.editReply({ content: 'The fetched meme was marked NSFW and has been filtered.', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(meme.title.slice(0, 256))
        .setURL(meme.postLink)
        .setImage(meme.url)
        .setColor(0xe879f9)
        .setFooter({ text: `r/${meme.subreddit} | 👍 ${meme.ups ?? 0}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[animeme]', err);
      await interaction.editReply('Failed to fetch an anime meme right now. Try again in a moment.');
    }
  },
};
