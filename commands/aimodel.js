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
const {
  getUserMode,
  setUserMode,
} = require('../utils/aiProfiles');

const SCOPE_USER = 'user';
const SCOPE_DEFAULT = 'default';

const SELECT_PREFIX = 'aimodel_select';
const MODE_PREFIX = 'aimodel_mode';
const RESET_PREFIX = 'aimodel_reset';
const REFRESH_PREFIX = 'aimodel_refresh';
const GEMMA_MODEL = 'gemma-4-31b-it';

const PROVIDER_LABELS = {
  gemini: 'Google AI',
  groq: 'Groq',
  github: 'GitHub Models',
};

const PROVIDER_EMOJIS = {
  gemini: '🟡',
  groq: '⚡',
  github: '🐙',
};

function flattenModelOptions() {
  const options = [];

  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    for (const model of models) {
      options.push({ provider, model });
    }
  }

  return options;
}

function providerLabel(provider) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function optionLabel(entry) {
  return `${providerLabel(entry.provider)} · ${entry.model}`.slice(0, 100);
}

function optionDescription(entry) {
  const tags = [];

  if (entry.provider === 'gemini' && entry.model === GEMMA_MODEL) {
    tags.push('Search grounded', 'Safety off');
  } else if (entry.provider === 'gemini') {
    tags.push('Google AI');
  } else if (entry.provider === 'groq') {
    tags.push('Fast Groq model');
  } else if (entry.provider === 'github') {
    tags.push('GitHub hosted');
  }

  tags.push(`${getModelCreditCost(entry.provider, entry.model)} credit(s)/request`);
  return tags.join(' · ').slice(0, 100);
}

function selectionLabel(selection) {
  return `${providerLabel(selection.provider)} · ${selection.model}`;
}

function selectionSummary(selection) {
  const bits = [selectionLabel(selection)];
  if (selection.provider === 'gemini' && selection.model === GEMMA_MODEL) {
    bits.push('Search grounded', 'safety off');
  }
  bits.push(`${getModelCreditCost(selection.provider, selection.model)} credit(s)/request`);
  return bits.join(' · ');
}

function scopeLabel(scope) {
  return scope === SCOPE_DEFAULT ? 'global default' : 'your model';
}

function buildStatusEmbed(userId, scope, selected = null, currentMode = null) {
  const userSelection = getUserAISelection(userId);
  const effective = selected ?? getEffectiveAISelection(userId);
  const defaultSelection = getDefaultAISelection();
  const geminiUsage = getGlobalGeminiUsage();
  
  const mode = currentMode ?? getUserMode(userId);

  const embed = new EmbedBuilder()
    .setColor(0x00a884)
    .setTitle('AI settings')
    .setDescription(`Target: **${scopeLabel(scope)}**\nPick a provider/model or personality mode below.`)
    .addFields(
      { name: 'Selected Model', value: selectionSummary(effective) },
    );

  if (scope === SCOPE_USER) {
    embed.addFields({ name: 'Personality Mode', value: mode === 'unfiltered' ? '🔓 Unfiltered' : '💬 Standard Chat' });
  }

  embed.addFields(
    { name: 'Your override', value: userSelection ? selectionSummary(userSelection) : 'none, using the bot default' },
    { name: 'Bot default', value: selectionSummary(defaultSelection) },
    { name: 'Gemini usage', value: `**${geminiUsage.used}/${geminiUsage.limit}** today` },
  );

  if (effective.provider === 'gemini' && effective.model === GEMMA_MODEL) {
    embed.addFields({
      name: 'Gemma note',
      value: 'This model uses Google Search grounding and has all safety settings disabled.',
    });
  }

  if (scope === SCOPE_DEFAULT) {
    embed.setFooter({ text: 'Owner mode: changes here update the bot default for everyone.' });
  } else {
    embed.setFooter({ text: 'Your personal selection only affects your account.' });
  }

  return embed;
}

function buildComponents(userId, scope, selected, currentMode = null) {
  const selectionValue = `${selected.provider}|${selected.model}`;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_PREFIX}:${userId}:${scope}`)
    .setPlaceholder('Choose a provider and model')
    .addOptions(
      flattenModelOptions().map((entry) => ({
        label: optionLabel(entry),
        value: `${entry.provider}|${entry.model}`,
        description: optionDescription(entry),
        default: `${entry.provider}|${entry.model}` === selectionValue,
        emoji: PROVIDER_EMOJIS[entry.provider] ? { name: PROVIDER_EMOJIS[entry.provider] } : undefined,
      })),
    );
    
  const rows = [new ActionRowBuilder().addComponents(menu)];

  if (scope === SCOPE_USER) {
    const mode = currentMode ?? getUserMode(userId);
    const modeMenu = new StringSelectMenuBuilder()
      .setCustomId(`${MODE_PREFIX}:${userId}:${scope}`)
      .setPlaceholder('Choose a personality mode')
      .addOptions([
        {
          label: 'Standard Chat',
          value: 'chat',
          description: 'Default friendly and helpful personality',
          default: mode === 'chat',
          emoji: { name: '💬' }
        },
        {
          label: 'Unfiltered',
          value: 'unfiltered',
          description: 'Uncensored, unhinged, literal responses',
          default: mode === 'unfiltered',
          emoji: { name: '🔓' }
        }
      ]);
    rows.push(new ActionRowBuilder().addComponents(modeMenu));

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
      embeds: [buildStatusEmbed(interaction.user.id, scope, selected)],
      components: buildComponents(interaction.user.id, scope, selected),
      ephemeral: true,
    });
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId.startsWith(`${SELECT_PREFIX}:`)) {
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
        embeds: [buildStatusEmbed(interaction.user.id, scope, saved)],
        components: buildComponents(interaction.user.id, scope, saved),
      });

      return true;
    }

    if (interaction.customId.startsWith(`${MODE_PREFIX}:`)) {
      const [, targetUserId, scope] = interaction.customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This model picker isn't for you.", ephemeral: true });
        return true;
      }

      const selectedMode = interaction.values?.[0] ?? 'chat';
      setUserMode(interaction.user.id, selectedMode);

      const selected = scope === SCOPE_DEFAULT ? getDefaultAISelection() : getEffectiveAISelection(interaction.user.id);

      await interaction.update({
        embeds: [buildStatusEmbed(interaction.user.id, scope, selected, selectedMode)],
        components: buildComponents(interaction.user.id, scope, selected, selectedMode),
      });

      return true;
    }

    return false;
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith(`${RESET_PREFIX}:`)) {
      const [, targetUserId] = interaction.customId.split(':');
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "This model picker isn't for you.", ephemeral: true });
        return true;
      }

      resetUserAISelection(interaction.user.id);
      setUserMode(interaction.user.id, 'chat');
      
      const effective = getEffectiveAISelection(interaction.user.id);

      await interaction.update({
        embeds: [buildStatusEmbed(interaction.user.id, SCOPE_USER, effective, 'chat')],
        components: buildComponents(interaction.user.id, SCOPE_USER, effective, 'chat'),
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
      const mode = getUserMode(interaction.user.id);
      await interaction.update({
        embeds: [buildStatusEmbed(interaction.user.id, scope, selected, mode)],
        components: buildComponents(interaction.user.id, scope, selected, mode),
      });
      return true;
    }

    return false;
  },
};
