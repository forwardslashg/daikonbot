const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
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
  getModelCreditCost,
  getGlobalGeminiUsage,
  isThinkingModel,
  isGemmaModel,
} = require('../utils/aiEngine');
const {
  getUserMode,
  setUserMode,
  VALID_MODES,
  hasUnfilteredPlusConsent,
} = require('../utils/aiProfiles');

const SCOPE_USER = 'user';
const SCOPE_DEFAULT = 'default';

const SELECT_PROVIDER_PREFIX = 'aimodel_provider';
const SELECT_MODEL_PREFIX = 'aimodel_model';
const MODE_PREFIX = 'aimodel_mode';
const RESET_PREFIX = 'aimodel_reset';
const REFRESH_PREFIX = 'aimodel_refresh';
const GEMMA_MODEL = 'gemma-4-31b-it';

const PROVIDER_LABELS = {
  gemini: 'Google AI (Gemini/Gemma)',
  groq: 'Groq (Fast inference)',
  github: 'GitHub Models (OpenAI + others)',
};

const PROVIDER_EMOJIS = {
  gemini: '🟡',
  groq: '⚡',
  github: '🐙',
};

function providerLabel(provider) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function modelLabel(entry) {
  return entry.model;
}

function modelDescription(entry) {
  const tags = [];
  const isThinking = isThinkingModel(entry.provider, entry.model);
  if (isThinking) tags.push('Reasoning');
  if (entry.provider === 'gemini' && entry.model === GEMMA_MODEL) tags.push('Search grounded, safety off');
  tags.push(`${getModelCreditCost(entry.provider, entry.model)}c/req`);
  return tags.join(' · ').slice(0, 100);
}

function selectionSummary(selection) {
  const bits = [`${providerLabel(selection.provider)} · ${selection.model}`];
  if (selection.provider === 'gemini' && selection.model === GEMMA_MODEL) {
    bits.push('(Search grounded, safety off)');
  }
  bits.push(`— ${getModelCreditCost(selection.provider, selection.model)} credit(s)/request`);
  return bits.join(' ');
}

function scopeLabel(scope) {
  return scope === SCOPE_DEFAULT ? 'global default' : 'your model';
}

function buildStatusEmbed(userId, scope, selected = null, currentMode = null, selectedProvider = null) {
  const userSelection = getUserAISelection(userId);
  const effective = selected ?? getEffectiveAISelection(userId);
  const defaultSelection = getDefaultAISelection();
  const geminiUsage = getGlobalGeminiUsage();
  
  const mode = currentMode ?? getUserMode(userId);

  const embed = new EmbedBuilder()
    .setColor(0x00a884)
    .setTitle('AI settings')
    .setDescription(`Target: **${scopeLabel(scope)}**\nPick a provider below, then choose a model.`)
    .addFields(
      { name: 'Selected', value: selectionSummary(effective) },
    );

  if (scope === SCOPE_USER) {
    const modeLabel = mode === 'unfiltered' ? '🔓 Unfiltered'
      : mode === 'unfiltered+' ? '🔴 Unfiltered+'
      : '💬 Standard Chat';
    embed.addFields({ name: 'Personality Mode', value: modeLabel });
  }

  embed.addFields(
    { name: 'Your override', value: userSelection ? selectionSummary(userSelection) : '*none*' },
    { name: 'Bot default', value: selectionSummary(defaultSelection) },
  );

  // Show usage based on effective model
  if (!isGemmaModel(effective.model) && effective.provider === AI_PROVIDERS.GEMINI) {
    embed.addFields({ name: 'Gemini usage', value: `**${geminiUsage.used}/${geminiUsage.limit}** today (Gemma unlimited)` });
  } else {
    embed.addFields({ name: 'Gemini usage', value: `Gemma: unlimited · Other: **${geminiUsage.used}/${geminiUsage.limit}** today` });
  }

  if (selectedProvider) {
    embed.addFields({ name: 'Provider selected', value: providerLabel(selectedProvider) });
  }

  embed.setFooter({ text: scope === SCOPE_DEFAULT ? 'Owner mode' : 'Your personal selection' });

  return embed;
}

function buildProviderMenu(userId, scope, currentProvider = null) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_PROVIDER_PREFIX}:${userId}:${scope}`)
    .setPlaceholder('Choose an AI provider...')
    .addOptions(
      Object.entries(AI_PROVIDERS).map(([key, value]) => ({
        label: PROVIDER_LABELS[value] ?? value,
        value,
        description: `${PROVIDER_MODELS[value]?.length ?? 0} models available`,
        default: value === currentProvider,
        emoji: PROVIDER_EMOJIS[value] ? { name: PROVIDER_EMOJIS[value] } : undefined,
      })),
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildModelMenu(userId, scope, provider) {
  const models = PROVIDER_MODELS[provider] ?? [];
  const effective = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(userId);
  const currentValue = `${effective.provider}|${effective.model}`;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_MODEL_PREFIX}:${userId}:${scope}:${provider}`)
    .setPlaceholder(`Choose a ${providerLabel(provider)} model...`);

  if (models.length === 0) {
    menu.addOptions([{
      label: 'No models available for this provider',
      value: 'none',
      default: true,
    }]);
  } else {
    for (const model of models) {
      menu.addOptions({
        label: modelLabel({ provider, model }),
        value: `${provider}|${model}`,
        description: modelDescription({ provider, model }),
        default: `${provider}|${model}` === currentValue,
        emoji: PROVIDER_EMOJIS[provider] ? { name: PROVIDER_EMOJIS[provider] } : undefined,
      });
    }
  }

  return new ActionRowBuilder().addComponents(menu);
}

function buildModeMenu(userId, currentMode = null, scope = SCOPE_USER) {
  const mode = currentMode ?? getUserMode(userId);
  const modeOptions = [
    {
      label: 'Standard Chat',
      value: 'chat',
      description: 'Friendly and helpful personality',
      emoji: { name: '💬' },
    },
    {
      label: 'Roast',
      value: 'roast',
      description: 'Witty and playful roasts',
      emoji: { name: '🔥' },
    },
    {
      label: 'Vibe Check',
      value: 'vibe',
      description: 'Perceptive personality read',
      emoji: { name: '✨' },
    },
    {
      label: 'TL;DR',
      value: 'tldr',
      description: 'Chat summarization mode',
      emoji: { name: '📝' },
    },
    {
      label: 'Unfiltered',
      value: 'unfiltered',
      description: 'No filters, uncensored responses',
      emoji: { name: '🔓' },
    },
    {
      label: 'Unfiltered+',
      value: 'unfiltered+',
      description: '⚠️ Literally ANYTHING allowed. Requires consent.',
      emoji: { name: '🔴' },
    },
  ].map((opt) => ({
    ...opt,
    default: opt.value === mode,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${MODE_PREFIX}:${userId}:${scope}`)
    .setPlaceholder('Choose a personality mode...')
    .addOptions(modeOptions);

  return new ActionRowBuilder().addComponents(menu);
}

function buildActionButtons(userId, scope, showBack = false) {
  const row = new ActionRowBuilder();

  if (showBack) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${REFRESH_PREFIX}:${userId}:${scope}`)
        .setLabel('Back to providers')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (scope === SCOPE_USER) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${RESET_PREFIX}:${userId}`)
        .setLabel('Reset to defaults')
        .setStyle(ButtonStyle.Danger),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${REFRESH_PREFIX}:${userId}:${scope}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary),
  );

  return row;
}

function parseSelectionValue(value) {
  const [provider, model] = String(value ?? '').split('|');
  if (!provider || !model) return null;
  return { provider, model };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimodel')
    .setDescription('Choose AI provider, model, and personality mode')
    .addStringOption((opt) =>
      opt
        .setName('scope')
        .setDescription('Change your model or the bot default (owner only)')
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
      embeds: [buildStatusEmbed(interaction.user.id, scope, selected)],
      components: [
        buildProviderMenu(interaction.user.id, scope, selected.provider),
        buildModeMenu(interaction.user.id),
        buildActionButtons(interaction.user.id, scope),
      ],
      ephemeral: true,
    });
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    // ── Provider selected → show model menu ──────────────────────────────────
    if (customId.startsWith(`${SELECT_PROVIDER_PREFIX}:`)) {
      const [, targetUserId, scope] = customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This picker isn't for you.", ephemeral: true });
        return true;
      }

      const provider = interaction.values?.[0];
      if (!provider || !AI_PROVIDERS[Object.keys(AI_PROVIDERS).find((k) => AI_PROVIDERS[k] === provider)]) {
        await interaction.reply({ content: 'Invalid provider selection.', ephemeral: true });
        return true;
      }

      const selected = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(targetUserId);

      await interaction.update({
        embeds: [buildStatusEmbed(targetUserId, scope, selected, null, provider)],
        components: [
          buildModelMenu(targetUserId, scope, provider),
          buildActionButtons(targetUserId, scope, true),
        ],
      });

      return true;
    }

    // ── Model selected → save and confirm ────────────────────────────────────
    if (customId.startsWith(`${SELECT_MODEL_PREFIX}:`)) {
      const [, targetUserId, scope] = customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This picker isn't for you.", ephemeral: true });
        return true;
      }

      if (scope === SCOPE_DEFAULT && !isOwner(interaction.user.id)) {
        await interaction.reply({ content: 'Only the bot owner can change the global default model.', ephemeral: true });
        return true;
      }

      const value = interaction.values?.[0];
      if (!value || value === 'none') {
        await interaction.reply({ content: 'Invalid model selection.', ephemeral: true });
        return true;
      }

      const parsed = parseSelectionValue(value);
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

      const embed = buildStatusEmbed(targetUserId, scope, saved);
      embed.setDescription(`✅ Model updated to **${parsed.model}** (${providerLabel(parsed.provider)})`);

      await interaction.update({
        embeds: [embed],
        components: [
          buildProviderMenu(targetUserId, scope, parsed.provider),
          buildModeMenu(targetUserId),
          buildActionButtons(targetUserId, scope),
        ],
      });

      return true;
    }

    // ── Mode selected ────────────────────────────────────────────────────────
    if (customId.startsWith(`${MODE_PREFIX}:`)) {
      const [, targetUserId, scope] = customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This picker isn't for you.", ephemeral: true });
        return true;
      }

      const selectedMode = interaction.values?.[0] ?? 'chat';
      if (!VALID_MODES.includes(selectedMode)) {
        await interaction.reply({ content: 'Invalid mode selection.', ephemeral: true });
        return true;
      }

      setUserMode(interaction.user.id, selectedMode);

      const selected = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(interaction.user.id);

      const embed = buildStatusEmbed(interaction.user.id, scope, selected, selectedMode);
      const consentNote = selectedMode === 'unfiltered+' && !hasUnfilteredPlusConsent(targetUserId)
        ? '\n\n⚠️ **Unfiltered+** requires consent. It will be requested on first `/ai` use.'
        : '';
      embed.setDescription(`✅ Mode set to **${selectedMode}**${consentNote}`);

      await interaction.update({
        embeds: [embed],
        components: [
          buildProviderMenu(targetUserId, scope, selected.provider),
          buildModeMenu(targetUserId, selectedMode),
          buildActionButtons(targetUserId, scope),
        ],
      });

      return true;
    }

    return false;
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith(`${RESET_PREFIX}:`)) {
      const [, targetUserId] = customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This button isn't for you.", ephemeral: true });
        return true;
      }

      resetUserAISelection(interaction.user.id);
      setUserMode(interaction.user.id, 'chat');

      const effective = getEffectiveAISelection(interaction.user.id);

      await interaction.update({
        embeds: [buildStatusEmbed(interaction.user.id, SCOPE_USER, effective, 'chat')],
        components: [
          buildProviderMenu(interaction.user.id, SCOPE_USER, effective.provider),
          buildModeMenu(interaction.user.id, 'chat'),
          buildActionButtons(interaction.user.id, SCOPE_USER),
        ],
      });
      return true;
    }

    if (customId.startsWith(`${REFRESH_PREFIX}:`)) {
      const [, targetUserId, scope] = customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This button isn't for you.", ephemeral: true });
        return true;
      }

      const selected = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(interaction.user.id);
      const mode = getUserMode(interaction.user.id);

      await interaction.update({
        embeds: [buildStatusEmbed(interaction.user.id, scope, selected, mode)],
        components: [
          buildProviderMenu(interaction.user.id, scope, selected.provider),
          buildModeMenu(interaction.user.id, mode),
          buildActionButtons(interaction.user.id, scope),
        ],
      });
      return true;
    }

    return false;
  },
};
