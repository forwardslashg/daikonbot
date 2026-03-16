const { SlashCommandBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  AI_PROVIDERS,
  PROVIDER_MODELS,
  getUserAISelection,
  getDefaultAISelection,
  getEffectiveAISelection,
  setUserAISelection,
  resetUserAISelection,
  setDefaultAISelection,
} = require('../utils/aiEngine');

const PROVIDER_CHOICES = [
  { name: 'Gemini', value: AI_PROVIDERS.GEMINI },
  { name: 'Groq', value: AI_PROVIDERS.GROQ },
];

function providerChoices(opt) {
  for (const choice of PROVIDER_CHOICES) {
    opt.addChoices(choice);
  }
  return opt;
}

function normalizeProvider(provider) {
  return String(provider ?? '').toLowerCase();
}

function listModels(provider) {
  const normalized = normalizeProvider(provider);
  return PROVIDER_MODELS[normalized] ?? [];
}

function validModel(provider, model) {
  return listModels(provider).includes(model);
}

function ownerOnly(interaction) {
  if (!isOwner(interaction.user.id)) {
    interaction.reply({ content: 'Only the bot owner can use this subcommand.', ephemeral: true });
    return false;
  }
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimodel')
    .setDescription('View or change your AI provider/model (saved across restarts)')
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show your current AI provider/model selection'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set your AI provider/model')
        .addStringOption((opt) =>
          providerChoices(
            opt
              .setName('provider')
              .setDescription('AI provider')
              .setRequired(true),
          ),
        )
        .addStringOption((opt) =>
          opt
            .setName('model')
            .setDescription('Model ID for the selected provider')
            .setRequired(true)
            .setMaxLength(120),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset to the bot default AI provider/model'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('models')
        .setDescription('List available models for a provider')
        .addStringOption((opt) =>
          providerChoices(
            opt
              .setName('provider')
              .setDescription('Provider to list models for')
              .setRequired(true),
          ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setdefault')
        .setDescription('(Owner) Set the default AI provider/model for all users')
        .addStringOption((opt) =>
          providerChoices(
            opt
              .setName('provider')
              .setDescription('AI provider')
              .setRequired(true),
          ),
        )
        .addStringOption((opt) =>
          opt
            .setName('model')
            .setDescription('Model ID for the selected provider')
            .setRequired(true)
            .setMaxLength(120),
        ),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'status') {
      const userSelection = getUserAISelection(userId);
      const effective = getEffectiveAISelection(userId);
      const defaultSelection = getDefaultAISelection();

      const lines = [
        `**AI Model Status**`,
        `Effective: \`${effective.provider}:${effective.model}\``,
        `Your override: ${userSelection ? `\`${userSelection.provider}:${userSelection.model}\`` : 'none (using default)'}`,
        `Default: \`${defaultSelection.provider}:${defaultSelection.model}\``,
      ];

      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
      return;
    }

    if (sub === 'models') {
      const provider = normalizeProvider(interaction.options.getString('provider', true));
      const models = listModels(provider);

      if (!models.length) {
        await interaction.reply({ content: 'No models are configured for that provider.', ephemeral: true });
        return;
      }

      await interaction.reply({
        content: `**${provider} models**\n${models.map((m) => `- \`${m}\``).join('\n')}`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'set') {
      const provider = normalizeProvider(interaction.options.getString('provider', true));
      const model = interaction.options.getString('model', true).trim();

      if (!validModel(provider, model)) {
        await interaction.reply({
          content: `Invalid model for **${provider}**. Use \`/aimodel models\` to see valid options.`,
          ephemeral: true,
        });
        return;
      }

      const selection = setUserAISelection(userId, provider, model);
      await interaction.reply({
        content: `Saved. Your AI model is now \`${selection.provider}:${selection.model}\`.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'reset') {
      resetUserAISelection(userId);
      const effective = getEffectiveAISelection(userId);
      await interaction.reply({
        content: `Reset complete. You're now using default \`${effective.provider}:${effective.model}\`.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'setdefault') {
      if (!ownerOnly(interaction)) return;

      const provider = normalizeProvider(interaction.options.getString('provider', true));
      const model = interaction.options.getString('model', true).trim();

      if (!validModel(provider, model)) {
        await interaction.reply({
          content: `Invalid model for **${provider}**. Use \`/aimodel models\` to see valid options.`,
          ephemeral: true,
        });
        return;
      }

      const selection = setDefaultAISelection(provider, model);
      await interaction.reply({
        content: `Default AI updated to \`${selection.provider}:${selection.model}\`.`,
        ephemeral: true,
      });
    }
  },
};