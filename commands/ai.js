const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  checkRateLimit,
  consumeRateLimit,
  remainingUses,
  getSession,
  appendSession,
  clearSession,
  sessionTurnCount,
  fetchChannelHistory,
  channelTypeLabel,
  splitMessage,
  sendWithRetry,
  getGeminiRateLimitInfo,
  callAI,
  buildSystemInstruction,
  getEffectiveAISelection,
} = require('../utils/aiEngine');

// ─── Button / modal id helpers ────────────────────────────────────────────────
// customId format:  ai_followup:<userId>   ai_newtopic:<userId>
//                   ai_modal:<userId>

const BTN_FOLLOWUP = (uid) => `ai_followup:${uid}`;
const BTN_NEWTOPIC = (uid) => `ai_newtopic:${uid}`;
const MODAL_ID     = (uid) => `ai_modal:${uid}`;

function makeButtons(userId, turnCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_FOLLOWUP(userId))
      .setLabel('Follow up')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BTN_NEWTOPIC(userId))
      .setLabel(turnCount > 0 ? 'New topic' : 'End chat')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Context block builder ────────────────────────────────────────────────────
async function buildContextBlock(interaction, prompt) {
  const user    = interaction.user;
  const member  = interaction.member;
  const guild   = interaction.guild;
  const channel = interaction.channel;

  const displayName   = member?.displayName ?? user.globalName ?? user.username;
  const chanTypeLabel = channelTypeLabel(channel);
  const channelName   = channel?.name ? `#${channel.name}` : null;
  const channelTopic  = channel?.topic ? channel.topic.replace(/\n+/g, ' ') : null;
  const guildName     = guild?.name ?? null;

  const locationLine = guildName
    ? `Server: **${guildName}** | Channel: ${channelName ?? chanTypeLabel}${channelTopic ? ` (topic: "${channelTopic}")` : ''}`
    : `Location: ${chanTypeLabel}`;

  const memberRoles = member?.roles?.cache
    ? [...member.roles.cache.values()].filter((r) => r.name !== '@everyone').map((r) => r.name).join(', ')
    : null;

  const history = await fetchChannelHistory(interaction);

  return [
    `[USER]`,
    `Display name: ${displayName}`,
    `Username: @${user.username}`,
    `User ID: ${user.id}`,
    memberRoles ? `Roles: ${memberRoles}` : null,
    ``,
    `[LOCATION]`,
    locationLine,
    ``,
    history
      ? `[RECENT CHAT HISTORY — last messages before this command]\n${history}`
      : `[RECENT CHAT HISTORY]\n(unavailable in this context)`,
    ``,
    `[USER'S MESSAGE]`,
    prompt,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

// ─── Footer helper ────────────────────────────────────────────────────────────
function makeFooter(userId, turns) {
  const selection = getEffectiveAISelection(userId);
  const modelInfo = ` · ${selection.provider}:${selection.model}`;

  if (isOwner(userId)) {
    return turns > 0 ? `-# Turn ${turns + 1} · no rate limits${modelInfo}` : `-# no rate limits${modelInfo}`;
  }
  const rem      = remainingUses(userId);
  const turnNote = turns > 0 ? ` · turn ${turns + 1}` : '';
  return `-# ${rem} AI use(s) remaining this hour${turnNote}${modelInfo}`;
}

// ─── Core AI reply ────────────────────────────────────────────────────────────
async function runAIChat(interaction, promptText, { isFollowUp = false } = {}) {
  const userId = interaction.user.id;

  if (!isOwner(userId)) {
    const check = checkRateLimit(userId);
    if (!check.allowed) {
      const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
      await interaction[method]({ content: check.message, ephemeral: true });
      return;
    }
    consumeRateLimit(userId);
  }

  const contextBlock   = await buildContextBlock(interaction, promptText);
  const session        = getSession(userId);
  const priorHistory   = session?.history ?? [];
  const selection      = getEffectiveAISelection(userId);
  const sysInstruction = buildSystemInstruction(userId, 'chat', selection.provider);

  try {
    let geminiRateLimited = false;
    let retryDelaySeconds = null;

    const text = await sendWithRetry(() =>
      callAI(sysInstruction, contextBlock, priorHistory, { userId }),
    4, 800, {
      onRetry: async ({ reason, gemini }) => {
        if (reason !== 'gemini-rate-limit' || geminiRateLimited) return;

        geminiRateLimited = true;
        retryDelaySeconds = gemini?.retryDelaySeconds ?? null;
        const delayText = retryDelaySeconds
          ? `about **${retryDelaySeconds}s**`
          : 'a short delay';

        await interaction.editReply({
          content: `Gemini rate-limited this request. I will auto-retry after ${delayText}.`,
          components: [],
        });
      },
    },
    );

    if (!text) {
      const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
      await interaction[method]({ content: 'The AI returned an empty response. Try rephrasing.', ephemeral: true });
      return;
    }

    const retryNote = retryDelaySeconds ? `${retryDelaySeconds}s` : 'the provider retry delay';
    const finalText = geminiRateLimited
      ? `-# This request was rate-limited by Gemini and auto-retried after ${retryNote}.\n\n${text}`
      : text;

    appendSession(userId, promptText, finalText);
    const turns   = sessionTurnCount(userId);
    const chunks  = splitMessage(finalText);
    const footer  = makeFooter(userId, turns - 1);
    const buttons = makeButtons(userId, turns);

    if (footer) chunks[chunks.length - 1] += `\n${footer}`;

    const send = isFollowUp ? 'followUp' : 'editReply';

    await sendWithRetry(() =>
      interaction[send]({ content: chunks[0], components: chunks.length === 1 ? [buttons] : [] }),
    );
    for (let i = 1; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      await sendWithRetry(() =>
        interaction.followUp({ content: chunks[i], components: isLast ? [buttons] : [] }),
      );
    }
  } catch (err) {
    const gemini = getGeminiRateLimitInfo(err);
    console.error('[AI chat]', err);
    const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    const message = gemini
      ? `Gemini is still rate-limiting this request. Please try again in about ${gemini.retryDelaySeconds}s.`
      : 'Failed to get a response from the AI. Please try again later.';
    await interaction[method]({ content: message, ephemeral: true }).catch(() => {});
  }
}

// ─── Button handler (exported → index.js) ────────────────────────────────────
async function handleButton(interaction) {
  const colonIdx     = interaction.customId.indexOf(':');
  const action       = interaction.customId.slice(0, colonIdx);
  const targetUserId = interaction.customId.slice(colonIdx + 1);

  // Only the original invoker may use these buttons
  if (interaction.user.id !== targetUserId) {
    await interaction.reply({ content: "These buttons aren't for you.", ephemeral: true });
    return;
  }

  if (action === 'ai_followup') {
    const modal = new ModalBuilder()
      .setCustomId(`ai_modal:${targetUserId}`)
      .setTitle('Follow up with AI');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('followup_text')
          .setLabel('Your follow-up message')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Continue the conversation...')
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  if (action === 'ai_newtopic') {
    clearSession(targetUserId);
    await interaction.reply({ content: '-# Conversation cleared. Start a new one with `/ai`.', ephemeral: true });
    return;
  }
}

// ─── Modal submit handler (exported → index.js) ──────────────────────────────
async function handleModal(interaction) {
  if (!interaction.customId.startsWith('ai_modal:')) return;

  const targetUserId = interaction.customId.slice('ai_modal:'.length);

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({ content: "This modal isn't for you.", ephemeral: true });
    return;
  }

  const followUpText = interaction.fields.getTextInputValue('followup_text').trim();
  if (!followUpText) {
    await interaction.reply({ content: 'Please enter a message.', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  await runAIChat(interaction, followUpText, { isFollowUp: true });
}

// ─── Command definition ───────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Chat with AI — remembers context within a conversation')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('Your message to the AI')
        .setRequired(true)
        .setMaxLength(1000),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  handleButton,
  handleModal,

  async execute(interaction) {
    const userId = interaction.user.id;

    if (!isOwner(userId)) {
      const check = checkRateLimit(userId);
      if (!check.allowed) {
        await interaction.reply({ content: check.message, ephemeral: true });
        return;
      }
    }

    await interaction.deferReply();
    await runAIChat(interaction, interaction.options.getString('prompt'));
  },
};
