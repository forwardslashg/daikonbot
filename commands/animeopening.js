const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`API request failed (${res.status})`);
  }

  return res.json();
}

function extractThemeTitle(themeLine) {
  const quoted = String(themeLine).match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  return String(themeLine).replace(/\s+by\s+.+$/i, '').trim();
}

function buildYouTubeSearchUrl(animeTitle, themeLine, type) {
  const themeTitle = extractThemeTitle(themeLine);
  const query = `${animeTitle} ${themeTitle} ${type === 'endings' ? 'ending' : 'opening'} full`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animeopening')
    .setDescription('Find opening/ending themes for an anime')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Anime title to search')
        .setRequired(true)
        .setMaxLength(120),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Theme type')
        .setRequired(false)
        .addChoices(
          { name: 'Openings', value: 'openings' },
          { name: 'Endings', value: 'endings' },
          { name: 'Both', value: 'both' },
        ),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('links')
        .setDescription('Include YouTube search links for themes')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    await interaction.deferReply();

    const title = interaction.options.getString('title', true).trim();
    const type = interaction.options.getString('type') ?? 'openings';
    const includeLinks = interaction.options.getBoolean('links') ?? true;

    try {
      const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
      const search = await fetchJson(searchUrl);
      const anime = search?.data?.[0];

      if (!anime) {
        await interaction.editReply(`No anime found for \`${title}\`.`);
        return;
      }

      const themes = await fetchJson(`https://api.jikan.moe/v4/anime/${anime.mal_id}/themes`);
      const openings = themes?.data?.openings ?? [];
      const endings = themes?.data?.endings ?? [];

      let lines = [];
      if (type === 'openings' || type === 'both') {
        lines = lines.concat(openings.slice(0, 10).map((item, i) => `**OP ${i + 1}:** ${item}`));
      }
      if (type === 'endings' || type === 'both') {
        lines = lines.concat(endings.slice(0, 10).map((item, i) => `**ED ${i + 1}:** ${item}`));
      }

      if (!lines.length) {
        await interaction.editReply(`I found **${anime.title}**, but no ${type === 'both' ? 'theme' : type} data was available.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Anime Themes: ${anime.title}`)
        .setURL(anime.url)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setColor(0x22c55e)
        .setFooter({ text: 'Data from Jikan (MyAnimeList)' });

      if (includeLinks) {
        const linkLines = [];
        if (type === 'openings' || type === 'both') {
          linkLines.push(
            ...openings.slice(0, 3).map((theme, i) =>
              `[OP ${i + 1}](${buildYouTubeSearchUrl(anime.title, theme, 'openings')})`,
            ),
          );
        }
        if (type === 'endings' || type === 'both') {
          linkLines.push(
            ...endings.slice(0, 3).map((theme, i) =>
              `[ED ${i + 1}](${buildYouTubeSearchUrl(anime.title, theme, 'endings')})`,
            ),
          );
        }
        if (linkLines.length) {
          embed.addFields({
            name: 'Watch / Clip Links',
            value: linkLines.join(' • ').slice(0, 1024),
          });
        }
      }

      if (anime.images?.jpg?.image_url) {
        embed.setThumbnail(anime.images.jpg.image_url);
      }

      let components = [];
      if (includeLinks) {
        const primaryTheme =
          (type === 'endings' ? endings[0] : openings[0]) || openings[0] || endings[0];
        if (primaryTheme) {
          const url = buildYouTubeSearchUrl(
            anime.title,
            primaryTheme,
            type === 'endings' ? 'endings' : 'openings',
          );
          components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(type === 'endings' ? 'Find Ending Clip' : 'Find Opening Clip')
                .setURL(url),
            ),
          ];
        }
      }

      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      console.error('[animeopening]', err);
      await interaction.editReply('Failed to fetch anime themes right now. Try again in a moment.');
    }
  },
};