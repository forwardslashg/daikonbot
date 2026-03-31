const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  PROVIDER_MODELS,
  getUserAISelection,
  getDefaultAISelection,
  getEffectiveAISelection,
  setUserAISelection,
  resetUserAISelection,
  setDefaultAISelection,
  getModelCreditCost,
  getGlobalGeminiUsage,
} = require('../utils/aiEngine');

const SCOPE_USER = 'user';
const SCOPE_DEFAULT = 'default';

const SELECT_PREFIX = 'aimodel_select';
const RESET_PREFIX = 'aimodel_reset';
const REFRESH_PREFIX = 'aimodel_refresh';

function flattenModelOptions() {
  const options = [];

  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    for (const model of models) {
      options.push({ provider, model });
    }
  }

  return options;
}

function scopeLabel(scope) {
  return scope === SCOPE_DEFAULT ? 'global default' : 'your model';
}

function selectionLabel(selection) {
  return `${selection.provider}:${selection.model}`;
}

function buildStatusText(userId, scope, selected = null) {
  const userSelection = getUserAISelection(userId);
  const effective = selected ?? getEffectiveAISelection(userId);
  const defaultSelection = getDefaultAISelection();
  const cost = getModelCreditCost(effective.provider, effective.model);
  const geminiUsage = getGlobalGeminiUsage();

  const lines = [
    '**AI model picker**',
    `Target: **${scopeLabel(scope)}**`,
    `Selected: \`${selectionLabel(effective)}\` (${cost} credit(s)/request)`,
    `Your override: ${userSelection ? `\`${selectionLabel(userSelection)}\`` : 'none (using default)'}`,
    `Bot default: \`${selectionLabel(defaultSelection)}\``,
    `Gemini global usage: **${geminiUsage.used}/${geminiUsage.limit}** today`,
    '',
    'Pick a model from the dropdown below.',
  ];

  if (scope === SCOPE_DEFAULT) {
    lines.push('-# Owner mode: your selection updates the bot default for everyone.');
  }

  return lines.join('\n');
}

function buildComponents(userId, scope, selected) {
  const selectionValue = `${selected.provider}|${selected.model}`;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_PREFIX}:${userId}:${scope}`)
    .setPlaceholder('Choose provider + model')
    .addOptions(
      flattenModelOptions().map((entry) => ({
        label: `${entry.provider} / ${entry.model}`.slice(0, 100),
        value: `${entry.provider}|${entry.model}`,
        description: `${getModelCreditCost(entry.provider, entry.model)} credit(s) per request`.slice(0, 100),
        default: `${entry.provider}|${entry.model}` === selectionValue,
      })),
    );

  const rows = [new ActionRowBuilder().addComponents(menu)];

  if (scope === SCOPE_USER) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${RESET_PREFIX}:${userId}`)
          .setLabel('Reset to default')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${REFRESH_PREFIX}:${userId}:${scope}`)
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${REFRESH_PREFIX}:${userId}:${scope}`)
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return rows;
}

function parseSelectionValue(value) {
  const [provider, model] = String(value ?? '').split('|');
  if (!provider || !model) return null;
  return { provider, model };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimodel')
    .setDescription('Unified AI model picker with dropdown selection')
    .addStringOption((opt) =>
      opt
        .setName('scope')
        .setDescription('Choose whether to update your model or the bot default (owner only)')
        .setRequired(false)
        .addChoices(
          { name: 'My model', value: SCOPE_USER },
          { name: 'Global default (owner only)', value: SCOPE_DEFAULT },
        ),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const scope = interaction.options.getString('scope') ?? SCOPE_USER;

    if (scope === SCOPE_DEFAULT && !isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'Only the bot owner can change the global default model.', ephemeral: true });
      return;
    }

    const selected = scope === SCOPE_DEFAULT
      ? getDefaultAISelection()
      : getEffectiveAISelection(interaction.user.id);

    await interaction.reply({
      content: buildStatusText(interaction.user.id, scope, selected),
      components: buildComponents(interaction.user.id, scope, selected),
      ephemeral: true,
    });
  },

  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith(`${SELECT_PREFIX}:`)) return false;

    const [, targetUserId, scope] = interaction.customId.split(':');
    if (interaction.user.id !== targetUserId) {
      await interaction.reply({ content: "This model picker isn't for you.", ephemeral: true });
      return true;
    }

    if (scope === SCOPE_DEFAULT && !isOwner(interaction.user.id)) {
      await interaction.reply({ content: 'Only the bot owner can change the global default model.', ephemeral: true });
      return true;
    }

    const parsed = parseSelectionValue(interaction.values?.[0]);
    if (!parsed) {
      await interaction.reply({ content: 'Invalid model selection.', ephemeral: true });
      return true;
    }

    let saved;
    if (scope === SCOPE_DEFAULT) {
      saved = setDefaultAISelection(parsed.provider, parsed.model);
    } else {
      saved = setUserAISelection(interaction.user.id, parsed.provider, parsed.model);
    }

    await interaction.update({
      content: `${buildStatusText(interaction.user.id, scope, saved)}\n\n✅ Updated ${scopeLabel(scope)} to \`${selectionLabel(saved)}\`.`,
      components: buildComponents(interaction.user.id, scope, saved),
    });

    return true;
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith(`${RESET_PREFIX}:`)) {
      const [, targetUserId] = interaction.customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This model picker isn't for you.", ephemeral: true });
        return true;
      }

      resetUserAISelection(interaction.user.id);
      const effective = getEffectiveAISelection(interaction.user.id);

      await interaction.update({
        content: `${buildStatusText(interaction.user.id, SCOPE_USER, effective)}\n\n✅ Reset complete. You are now using the bot default model.`,
        components: buildComponents(interaction.user.id, SCOPE_USER, effective),
      });
      return true;
    }

    if (interaction.customId.startsWith(`${REFRESH_PREFIX}:`)) {
      const [, targetUserId, scope] = interaction.customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This model picker isn't for you.", ephemeral: true });
        return true;
      }

      const selected = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(interaction.user.id);
      await interaction.update({
        content: buildStatusText(interaction.user.id, scope, selected),
        components: buildComponents(interaction.user.id, scope, selected),
      });
      return true;
    }

    return false;
  },
};
