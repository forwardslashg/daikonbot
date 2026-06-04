const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

class EmbedBuilder {
  constructor() {
    this.container = new ContainerBuilder();
    this.title = null;
    this.description = null;
    this.thumbnailUrl = null;
    this.imageUrl = null;
    this.fields = [];
    this.footer = null;
    this.color = 0x3b82f6; // default color
    this.url = null;
  }
  setTitle(t) { this.title = t; return this; }
  setDescription(d) { this.description = d; return this; }
  setThumbnail(u) { this.thumbnailUrl = u; return this; }
  setImage(u) { this.imageUrl = u; return this; }
  setColor(c) { this.color = c; return this; }
  setURL(u) { this.url = u; return this; }
  addFields(...f) {
    for (const field of f) {
      if (Array.isArray(field)) {
        this.fields.push(...field);
      } else {
        this.fields.push(field);
      }
    }
    return this;
  }
  setFooter(f) { this.footer = f.text; return this; }
  setAuthor(a) { this.author = a.name; return this; }
  setTimestamp() { return this; }

  toJSON() {
    this.container.setAccentColor(this.color);

    // Add title/description/thumbnail in a section
    if (this.title || this.description || this.thumbnailUrl) {
      const section = new SectionBuilder();

      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));

      if (this.thumbnailUrl) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(this.thumbnailUrl));
      }

      if (section.components && section.components.length > 0) {
        this.container.addSectionComponents(section);
      }
    }

    for (const f of this.fields) {
      this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${f.name}**\n${f.value}`));
    }

    if (this.imageUrl) {
      this.container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: this.imageUrl } })
      );
    }

    if (this.footer) {
      this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`- # ${this.footer}`));
    }

    return this.container.toJSON();
  }
}


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

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animeme]', err);
      await interaction.editReply('Failed to fetch an anime meme right now. Try again in a moment.');
    }
  },
};
