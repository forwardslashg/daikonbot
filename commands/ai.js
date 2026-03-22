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
  callAIWithTools,
  buildSystemInstruction,
  getEffectiveAISelection,
} = require('../utils/aiEngine');
const {
  getAniListUsername,
  setAniListUsername,
} = require('../utils/aiProfiles');
const {
  getAniListUserOverview,
  getAniListWatchingList,
  getAniListRecommendationsByTitle,
  getAniListTrendingSeason,
} = require('../utils/anilist');

// ─── Button / modal id helpers ────────────────────────────────────────────────
// customId format: ai_followup:<userId>, ai_newtopic:<userId>, ai_summary:<userId>,
//                  ai_anilist_profile:<userId>, ai_anilist_recs:<userId>
// modal format:    ai_modal_followup:<userId>
//                  ai_modal_anilist:<userId>:<mode>

const BTN_FOLLOWUP = (uid) => `ai_followup:${uid}`;
const BTN_NEWTOPIC = (uid) => `ai_newtopic:${uid}`;
const BTN_SUMMARY = (uid) => `ai_summary:${uid}`;
const BTN_ANILIST_PROFILE = (uid) => `ai_anilist_profile:${uid}`;
const BTN_ANILIST_RECS = (uid) => `ai_anilist_recs:${uid}`;

const MODAL_FOLLOWUP_ID = (uid) => `ai_modal_followup:${uid}`;
const MODAL_ANILIST_ID = (uid, mode) => `ai_modal_anilist:${uid}:${mode}`;

const COMPONENTS_V2_FLAG = 1 << 15;

const AI_TOOLS = [
  {
    name: 'anilist_user_overview',
    description: 'Get AniList profile summary and anime stats for a username.',
    argumentsSchema: {
      username: 'string (optional; omit to use linked username)',
    },
  },
  {
    name: 'anilist_current_watching',
    description: 'Get anime currently being watched by an AniList user.',
    argumentsSchema: {
      username: 'string (optional; omit to use linked username)',
      limit: 'number (optional; 1-25)',
    },
  },
  {
    name: 'anilist_recommendations_by_title',
    description: 'Get AniList recommendations for an anime title.',
    argumentsSchema: {
      title: 'string (required)',
      limit: 'number (optional; 1-20)',
    },
  },
  {
    name: 'anilist_trending_season',
    description: 'Get current/selected season trending anime on AniList.',
    argumentsSchema: {
      season: 'WINTER|SPRING|SUMMER|FALL (optional)',
      year: 'number (optional)',
      limit: 'number (optional; 1-20)',
    },
  },
];

function makeButtons(userId, turnCount) {
  return makeButtonsWithContext(userId, turnCount);
}

function makeButtonsWithContext(
  userId,
  turnCount,
  { includeAniList = false, needsAniListAccess = false, hasLinkedAniList = false } = {},
) {
  const row = new ActionRowBuilder();

  if (includeAniList) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_ANILIST_PROFILE(userId))
        .setLabel(needsAniListAccess || !hasLinkedAniList ? 'Link AniList' : 'My AniList')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(BTN_ANILIST_RECS(userId))
        .setLabel('Anime recs')
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Success),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_SUMMARY(userId))
      .setLabel('Summarize')
      .setEmoji('🧠')
      .setStyle(ButtonStyle.Secondary),
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

  return row;
}

function makeButtonsV2(
  userId,
  turnCount,
  { includeAniList = false, needsAniListAccess = false, hasLinkedAniList = false } = {},
) {
  const buttons = [];

  if (includeAniList) {
    buttons.push(
      {
        type: 2,
        custom_id: BTN_ANILIST_PROFILE(userId),
        label: needsAniListAccess || !hasLinkedAniList ? 'Link AniList' : 'My AniList',
        emoji: { name: '📊' },
        style: ButtonStyle.Success,
      },
      {
        type: 2,
        custom_id: BTN_ANILIST_RECS(userId),
        label: 'Anime recs',
        emoji: { name: '🎯' },
        style: ButtonStyle.Success,
      },
    );
  }

  buttons.push(
    {
      type: 2,
      custom_id: BTN_SUMMARY(userId),
      label: 'Summarize',
      emoji: { name: '🧠' },
      style: ButtonStyle.Secondary,
    },
    {
      type: 2,
      custom_id: BTN_FOLLOWUP(userId),
      label: 'Follow up',
      emoji: { name: '💬' },
      style: ButtonStyle.Primary,
    },
    {
      type: 2,
      custom_id: BTN_NEWTOPIC(userId),
      label: turnCount > 0 ? 'New topic' : 'End chat',
      emoji: { name: '🗑️' },
      style: ButtonStyle.Secondary,
    },
  );

  return buttons;
}

function buildComponentsV2Payload(text, userId, turns, footer, buttonContext = {}) {
  const finalText = footer ? `${text}\n${footer}` : text;

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: 0x00a884,
        components: [
          { type: 10, content: finalText },
          { type: 1, components: makeButtonsV2(userId, turns, buttonContext) },
        ],
      },
    ],
  };
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

function resolveAniListUsername(userId, args) {
  const requested = typeof args.username === 'string' ? args.username.trim() : '';
  if (requested) return requested;

  const saved = getAniListUsername(userId);
  if (saved) return saved;

  throw new Error('No AniList username found. Use the Link AniList button to link one.');
}

async function executeAITool(name, args, userId) {
  const toolState = args && typeof args.__toolState === 'object' ? args.__toolState : null;

  if (toolState) {
    toolState.usedAniListTool = true;
  }

  if (name === 'anilist_user_overview') {
    let username;
    try {
      username = resolveAniListUsername(userId, args);
    } catch (err) {
      if (toolState) toolState.needsAniListAccess = true;
      throw err;
    }

    const overview = await getAniListUserOverview(username);
    if (!overview) throw new Error(`AniList user "${username}" was not found.`);
    return overview;
  }

  if (name === 'anilist_current_watching') {
    let username;
    try {
      username = resolveAniListUsername(userId, args);
    } catch (err) {
      if (toolState) toolState.needsAniListAccess = true;
      throw err;
    }

    const limit = Number(args.limit) || 10;
    const watching = await getAniListWatchingList(username, limit);
    return { username, watching };
  }

  if (name === 'anilist_recommendations_by_title') {
    const title = String(args.title ?? '').trim();
    if (!title) throw new Error('The tool requires a non-empty title.');

    const limit = Number(args.limit) || 8;
    const recs = await getAniListRecommendationsByTitle(title, limit);
    if (!recs) throw new Error(`No anime was found for title "${title}".`);
    return recs;
  }

  if (name === 'anilist_trending_season') {
    return getAniListTrendingSeason({
      season: args.season,
      year: args.year,
      limit: args.limit,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ─── Core AI reply ────────────────────────────────────────────────────────────
async function runAIChat(interaction, promptText, { isFollowUp = false } = {}) {
  const userId = interaction.user.id;
  const linkedAniList = getAniListUsername(userId);
  const promptLower = String(promptText ?? '').toLowerCase();
  const askedAniList = /\banilist\b|\bmy anime\b|\banime list\b|\bwatchlist\b|\brecommend\b/.test(promptLower);
  const toolState = {
    usedAniListTool: false,
    needsAniListAccess: false,
  };

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

    const { text, toolCalls } = await sendWithRetry(() =>
      callAIWithTools(sysInstruction, contextBlock, priorHistory, { userId, maxToolCalls: 4 }, AI_TOOLS, (name, args) =>
        executeAITool(name, { ...(args ?? {}), __toolState: toolState }, userId),
      ),
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
    let finalText = geminiRateLimited
      ? `-# This request was rate-limited by Gemini and auto-retried after ${retryNote}.\n\n${text}`
      : text;

    if (toolCalls > 0) {
      finalText = `-# Used ${toolCalls} live data tool call(s).\n\n${finalText}`;
    }

    const includeAniList = askedAniList || toolState.usedAniListTool || toolState.needsAniListAccess;
    const needsAniListAccess = includeAniList && (!linkedAniList || toolState.needsAniListAccess);

    if (needsAniListAccess) {
      finalText = `-# Need access to your AniList data? Tap **Link AniList** below and I can pull your profile/watchlist details.\n\n${finalText}`;
    }

    appendSession(userId, promptText, finalText);
    const turns   = sessionTurnCount(userId);
    const chunks  = splitMessage(finalText);
    const footer  = makeFooter(userId, turns - 1);
    const buttonContext = {
      includeAniList,
      needsAniListAccess,
      hasLinkedAniList: Boolean(linkedAniList),
    };
    const buttons = makeButtonsWithContext(userId, turns, buttonContext);

    const send = interaction.deferred ? 'editReply' : (isFollowUp ? 'followUp' : 'editReply');

    if (chunks.length === 1) {
      try {
        await sendWithRetry(() => interaction[send](buildComponentsV2Payload(chunks[0], userId, turns, footer, buttonContext)));
      } catch {
        await sendWithRetry(() =>
          interaction[send]({
            content: footer ? `${chunks[0]}\n${footer}` : chunks[0],
            components: [buttons],
          }),
        );
      }
      return;
    }

    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      if (!isLast) {
        await sendWithRetry(() =>
          interaction[i === 0 ? send : 'followUp']({ content: chunks[i], components: [] }),
        );
        continue;
      }

      try {
        await sendWithRetry(() => interaction.followUp(buildComponentsV2Payload(chunks[i], userId, turns, footer, buttonContext)));
      } catch {
        await sendWithRetry(() =>
          interaction.followUp({
            content: footer ? `${chunks[i]}\n${footer}` : chunks[i],
            components: [buttons],
          }),
        );
      }
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
      .setCustomId(MODAL_FOLLOWUP_ID(targetUserId))
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

  if (action === 'ai_summary') {
    const session = getSession(targetUserId);
    const lastModelMessage = [...(session?.history ?? [])]
      .reverse()
      .find((item) => item.role === 'model')?.parts?.[0]?.text;

    if (!lastModelMessage) {
      await interaction.reply({ content: 'No previous AI reply found to summarize.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    await runAIChat(
      interaction,
      `Summarize your previous answer in 5 concise bullet points and end with one actionable next step:\n\n${lastModelMessage}`,
      { isFollowUp: true },
    );
    return;
  }

  if (action === 'ai_anilist_profile') {
    const savedUsername = getAniListUsername(targetUserId);

    if (!savedUsername) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ANILIST_ID(targetUserId, 'profile'))
        .setTitle('Link AniList Username');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('anilist_username')
            .setLabel('AniList username')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. DaikonFan')
            .setMaxLength(20)
            .setRequired(true),
        ),
      );

      await interaction.showModal(modal);
      return;
    }

    await interaction.deferReply();
    await runAIChat(interaction, `Use AniList tools to show my profile overview for username ${savedUsername}. Include watching stats and 3 personalized suggestions.`, { isFollowUp: true });
    return;
  }

  if (action === 'ai_anilist_recs') {
    const savedUsername = getAniListUsername(targetUserId);

    if (!savedUsername) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ANILIST_ID(targetUserId, 'recs'))
        .setTitle('Link AniList Username');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('anilist_username')
            .setLabel('AniList username')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. DaikonFan')
            .setMaxLength(20)
            .setRequired(true),
        ),
      );

      await interaction.showModal(modal);
      return;
    }

    await interaction.deferReply();
    await runAIChat(interaction, `Use AniList tools to inspect ${savedUsername}'s current anime and suggest 8 anime recommendations with short reasons.`, { isFollowUp: true });
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
  if (!interaction.customId.startsWith('ai_modal_')) return;

  const pieces = interaction.customId.split(':');
  const modalKind = pieces[0];
  const targetUserId = pieces[1];
  const mode = pieces[2] ?? null;

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({ content: "This modal isn't for you.", ephemeral: true });
    return;
  }

  if (modalKind === 'ai_modal_anilist') {
    const username = interaction.fields.getTextInputValue('anilist_username').trim();

    try {
      const saved = setAniListUsername(targetUserId, username);
      await interaction.deferReply();

      if (mode === 'recs') {
        await runAIChat(
          interaction,
          `Use AniList tools to inspect ${saved}'s currently watched anime and suggest 8 tailored recommendations with short reasons.`,
          { isFollowUp: true },
        );
      } else {
        await runAIChat(
          interaction,
          `Use AniList tools to show my profile overview for username ${saved}. Include key stats and 3 suggestions for what to watch next.`,
          { isFollowUp: true },
        );
      }
    } catch (err) {
      await interaction.reply({
        content: err?.message || 'Invalid AniList username format.',
        ephemeral: true,
      });
    }
    return;
  }

  if (modalKind !== 'ai_modal_followup') return;

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
