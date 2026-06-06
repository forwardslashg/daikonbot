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

function trim(text, max) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animecharacter')
    .setDescription('Look up an anime character')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Character name')
        .setRequired(true)
        .setMaxLength(120),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const name = interaction.options.getString('name', true).trim();

    try {
      const search = await fetchJson(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(name)}&limit=1`);
      const found = search?.data?.[0];

      if (!found) {
        await interaction.editReply(`No character found for \`${name}\`.`);
        return;
      }

      const full = await fetchJson(`https://api.jikan.moe/v4/characters/${found.mal_id}/full`);
      const character = full?.data ?? found;

      const animeNames = (character?.anime ?? [])
        .slice(0, 5)
        .map((a) => a?.anime?.title)
        .filter(Boolean);

      const embed = new EmbedBuilder()
        .setTitle(character.name)
        .setURL(character.url ?? found.url)
        .setDescription(trim(character.about?.replace(/\n{3,}/g, '\n\n'), 1200) ?? 'No biography available.')
        .setColor(0x3b82f6)
        .addFields(
          { name: 'Favorites', value: String(character.favorites ?? 0), inline: true },
          {
            name: 'Appears In',
            value: animeNames.length ? animeNames.join(', ') : 'No anime list available',
            inline: false,
          },
        )
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      const imageUrl = character.images?.jpg?.image_url ?? found.images?.jpg?.image_url;
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
    } catch (err) {
      console.error('[animecharacter]', err);
      await interaction.editReply('Failed to fetch character info right now. Try again in a moment.');
    }
  },
};