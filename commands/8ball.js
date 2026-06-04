const { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, MessageFlags } = require('discord.js');

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

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [embed] });
  },
};
