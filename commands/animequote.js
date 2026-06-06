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

    // Add title/description/thumbnail in a section if thumbnail exists
    if (this.thumbnailUrl) {
      const section = new SectionBuilder();

      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));

      section.setThumbnailAccessory(new ThumbnailBuilder().setURL(this.thumbnailUrl));

      this.container.addSectionComponents(section);
    } else if (this.title || this.description) {
      // No thumbnail, so add title/description directly to the container (no SectionBuilder needed)
      let titleText = this.title ? `# ${this.title}` : '';
      if (titleText && this.url) titleText = `# [${this.title}](${this.url})`;

      if (titleText) this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText));
      if (this.description) this.container.addTextDisplayComponents(new TextDisplayBuilder().setContent(this.description));
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


async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`API request failed (${res.status})`);
  }

  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animequote')
    .setDescription('Get a random anime quote')
    .addStringOption((opt) =>
      opt
        .setName('anime')
        .setDescription('Anime title to get a quote from (optional)')
        .setRequired(false)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const animeFilter = interaction.options.getString('anime')?.trim();

    try {
      let quoteData;

      if (animeFilter) {
        const res = await fetchJson(
          `https://api.animechan.io/v1/quotes/random?anime=${encodeURIComponent(animeFilter)}`,
        );
        const list = res?.data;
        if (!list?.length) {
          await interaction.editReply(`No quotes found for \`${animeFilter}\`.`);
          return;
        }
        quoteData = list[Math.floor(Math.random() * list.length)];
      } else {
        const res = await fetchJson('https://api.animechan.io/v1/quotes/random');
        quoteData = res?.data;
      }

      if (!quoteData?.content) {
        await interaction.editReply('Could not retrieve a quote right now. Try again in a moment.');
        return;
      }

      const characterName = quoteData.character?.name ?? 'Unknown';
      const animeName = quoteData.anime?.name ?? 'Unknown';

      const embed = new EmbedBuilder()
        .setDescription(`> ${quoteData.content}`)
        .setColor(0x6366f1)
        .addFields(
          { name: 'Character', value: characterName, inline: true },
          { name: 'Anime', value: animeName, inline: true },
        )
        .setFooter({ text: 'Data from Animechan' });

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animequote]', err);
      await interaction.editReply('Failed to fetch a quote right now. Try again in a moment.');
    }
  },
};
