/**
 * Shared AI engine utilities used by all AI-powered commands.
 * Centralises: rate limiting, conversation sessions, channel history,
 * message splitting, retry logic, and AI provider routing (Gemini + Groq).
 */

const { ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────
const OWNER_ID = '1470267547789033523';

const AI_PROVIDERS = {
  GEMINI: 'gemini',
  GROQ: 'groq',
  GITHUB_MODELS: 'github',
};

const PROVIDER_MODELS = {
  [AI_PROVIDERS.GEMINI]: [
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
  ],
  [AI_PROVIDERS.GROQ]: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'deepseek-r1-distill-llama-70b',
  ],
  [AI_PROVIDERS.GITHUB_MODELS]: [
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'openai/gpt-4.1-nano',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-5',
    'openai/gpt-5-chat',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'meta/llama-3.3-70b-instruct',
  ],
};

const MODEL_CREDIT_COST = {
  'gemini-3-flash-preview': 1,
  'gemini-3.1-pro-preview': 3,
  'llama-3.3-70b-versatile': 2,
  'llama-3.1-8b-instant': 1,
  'deepseek-r1-distill-llama-70b': 2,
  'openai/gpt-4.1': 3,
  'openai/gpt-4.1-mini': 2,
  'openai/gpt-4.1-nano': 1,
  'openai/gpt-4o': 3,
  'openai/gpt-4o-mini': 2,
  'openai/gpt-5': 4,
  'openai/gpt-5-chat': 3,
  'openai/gpt-5-mini': 2,
  'openai/gpt-5-nano': 1,
  'meta/llama-3.3-70b-instruct': 2,
};

const DEFAULT_PROVIDER = AI_PROVIDERS.GEMINI;
const DEFAULT_MODEL_BY_PROVIDER = {
  [AI_PROVIDERS.GEMINI]: 'gemini-3-flash-preview',
  [AI_PROVIDERS.GROQ]: 'llama-3.3-70b-versatile',
  [AI_PROVIDERS.GITHUB_MODELS]: 'openai/gpt-4.1-mini',
};

// Backward-compatible export name used by other files.
const MODEL_NAME = DEFAULT_MODEL_BY_PROVIDER[AI_PROVIDERS.GEMINI];

// Rate limits (non-owners only, shared across ALL ai-powered commands)
const HOURLY_MAX = 12;
const COOLDOWN_MS = 15_000;
const HOUR_MS = 60 * 60 * 1000;
const GLOBAL_GEMINI_DAILY_MAX = 20;

// Conversation sessions
const SESSION_TTL = 30 * 60 * 1000;
const SESSION_TURNS = 10;

// Channel history
const HISTORY_LIMIT = 20;

// Message splitting
const MAX_CHARS = 1980;

// ─── Persistent AI settings ──────────────────────────────────────────────────
const DATA_DIR = join(__dirname, '..', 'data');
const AI_SETTINGS_FILE = join(DATA_DIR, 'ai-settings.json');
const AI_MODERATION_FILE = join(DATA_DIR, 'ai-moderation.json');

const DEFAULT_SETTINGS = {
  default: {
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL_BY_PROVIDER[DEFAULT_PROVIDER],
  },
  users: {},
  globalUsage: {
    geminiDay: null,
    geminiCount: 0,
  },
};

let _aiSettingsCache = null;
let _moderationLoaded = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProvider(provider) {
  const p = String(provider ?? '').toLowerCase();
  return Object.values(AI_PROVIDERS).includes(p) ? p : null;
}

function isValidModelForProvider(provider, model) {
  const models = PROVIDER_MODELS[provider] ?? [];
  return models.includes(model);
}

function normalizeSelection(provider, model) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return null;

  if (!model) {
    return {
      provider: normalizedProvider,
      model: DEFAULT_MODEL_BY_PROVIDER[normalizedProvider],
    };
  }

  if (!isValidModelForProvider(normalizedProvider, model)) return null;
  return { provider: normalizedProvider, model };
}

function ensureSettingsLoaded() {
  if (_aiSettingsCache) return _aiSettingsCache;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(AI_SETTINGS_FILE)) {
    _aiSettingsCache = clone(DEFAULT_SETTINGS);
    writeFileSync(AI_SETTINGS_FILE, JSON.stringify(_aiSettingsCache, null, 2), 'utf8');
    return _aiSettingsCache;
  }

  try {
    const raw = readFileSync(AI_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    const defaultSelection = normalizeSelection(parsed?.default?.provider, parsed?.default?.model)
      ?? clone(DEFAULT_SETTINGS.default);

    const users = {};
    const sourceUsers = parsed?.users && typeof parsed.users === 'object' ? parsed.users : {};
    for (const [userId, selection] of Object.entries(sourceUsers)) {
      const normalized = normalizeSelection(selection?.provider, selection?.model);
      if (normalized) users[userId] = normalized;
    }

    const currentDay = getUtcDayKey();
    const rawGlobalUsage = parsed?.globalUsage && typeof parsed.globalUsage === 'object'
      ? parsed.globalUsage
      : {};

    let geminiDay = typeof rawGlobalUsage.geminiDay === 'string' ? rawGlobalUsage.geminiDay : currentDay;
    let geminiCount = Number.isInteger(rawGlobalUsage.geminiCount) && rawGlobalUsage.geminiCount >= 0
      ? rawGlobalUsage.geminiCount
      : 0;

    if (geminiDay !== currentDay) {
      geminiDay = currentDay;
      geminiCount = 0;
    }

    _aiSettingsCache = {
      default: defaultSelection,
      users,
      globalUsage: {
        geminiDay,
        geminiCount,
      },
    };
  } catch {
    _aiSettingsCache = clone(DEFAULT_SETTINGS);
  }

  return _aiSettingsCache;
}

function saveSettings() {
  const settings = ensureSettingsLoaded();
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(AI_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getUtcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureGlobalUsageState() {
  const settings = ensureSettingsLoaded();
  const day = getUtcDayKey();

  if (!settings.globalUsage || typeof settings.globalUsage !== 'object') {
    settings.globalUsage = { geminiDay: day, geminiCount: 0 };
    saveSettings();
  }

  if (settings.globalUsage.geminiDay !== day) {
    settings.globalUsage.geminiDay = day;
    settings.globalUsage.geminiCount = 0;
    saveSettings();
  }

  return settings.globalUsage;
}

function getModelCreditCost(provider, model) {
  const selection = normalizeSelection(provider, model);
  if (!selection) return 1;
  return MODEL_CREDIT_COST[selection.model] ?? 1;
}

function getGlobalGeminiUsage() {
  const usage = ensureGlobalUsageState();
  return {
    day: usage.geminiDay,
    used: usage.geminiCount,
    remaining: Math.max(0, GLOBAL_GEMINI_DAILY_MAX - usage.geminiCount),
    limit: GLOBAL_GEMINI_DAILY_MAX,
  };
}

function checkGlobalProviderLimit(provider) {
  if (provider !== AI_PROVIDERS.GEMINI) {
    return { allowed: true, remaining: Infinity, limit: null };
  }

  const usage = getGlobalGeminiUsage();
  if (usage.used >= GLOBAL_GEMINI_DAILY_MAX) {
    return {
      allowed: false,
      message: `Global Gemini daily cap reached (**${GLOBAL_GEMINI_DAILY_MAX}/day**). Choose a Groq or GitHub model until the next UTC day.`,
      remaining: 0,
      limit: GLOBAL_GEMINI_DAILY_MAX,
      resetOn: usage.day,
    };
  }

  return {
    allowed: true,
    remaining: usage.remaining,
    limit: GLOBAL_GEMINI_DAILY_MAX,
    resetOn: usage.day,
  };
}

function consumeGlobalProviderLimit(provider) {
  if (provider !== AI_PROVIDERS.GEMINI) return;
  const settings = ensureSettingsLoaded();
  const usage = ensureGlobalUsageState();
  usage.geminiCount += 1;
  settings.globalUsage = usage;
  saveSettings();
}

function ensureModerationLoaded() {
  if (_moderationLoaded) return;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  _banStore.clear();
  _userLimitStore.clear();

  if (!existsSync(AI_MODERATION_FILE)) {
    _moderationLoaded = true;
    saveModeration();
    return;
  }

  try {
    const raw = readFileSync(AI_MODERATION_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    const bans = parsed?.bans && typeof parsed.bans === 'object' ? parsed.bans : {};
    for (const [userId, ban] of Object.entries(bans)) {
      if (!ban || typeof ban !== 'object') continue;
      const reason = typeof ban.reason === 'string' && ban.reason.trim() ? ban.reason.trim() : 'No reason given.';
      const bannedAt = Number.isFinite(ban.bannedAt) ? ban.bannedAt : Date.now();
      const bannedBy = typeof ban.bannedBy === 'string' ? ban.bannedBy : null;
      _banStore.set(userId, { reason, bannedAt, bannedBy });
    }

    const customLimits = parsed?.customLimits && typeof parsed.customLimits === 'object' ? parsed.customLimits : {};
    for (const [userId, limit] of Object.entries(customLimits)) {
      const normalized = Number.isInteger(limit) && limit >= 0 ? limit : null;
      if (normalized !== null) _userLimitStore.set(userId, normalized);
    }
  } catch {
    // Fall back to empty moderation state on malformed files.
  }

  _moderationLoaded = true;
}

function saveModeration() {
  if (!_moderationLoaded) {
    _moderationLoaded = true;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const bans = {};
  for (const [userId, value] of _banStore.entries()) {
    bans[userId] = value;
  }

  const customLimits = {};
  for (const [userId, value] of _userLimitStore.entries()) {
    customLimits[userId] = value;
  }

  writeFileSync(
    AI_MODERATION_FILE,
    JSON.stringify({ bans, customLimits }, null, 2),
    'utf8',
  );
}

function getDefaultAISelection() {
  const settings = ensureSettingsLoaded();
  return clone(settings.default);
}

function setDefaultAISelection(provider, model) {
  const normalized = normalizeSelection(provider, model);
  if (!normalized) throw new Error('Invalid provider/model selection.');

  const settings = ensureSettingsLoaded();
  settings.default = normalized;
  saveSettings();
  return clone(normalized);
}

function getUserAISelection(userId) {
  const settings = ensureSettingsLoaded();
  return settings.users[userId] ? clone(settings.users[userId]) : null;
}

function setUserAISelection(userId, provider, model) {
  const normalized = normalizeSelection(provider, model);
  if (!normalized) throw new Error('Invalid provider/model selection.');

  const settings = ensureSettingsLoaded();
  settings.users[userId] = normalized;
  saveSettings();
  return clone(normalized);
}

function resetUserAISelection(userId) {
  const settings = ensureSettingsLoaded();
  delete settings.users[userId];
  saveSettings();
}

function getEffectiveAISelection(userId) {
  const userSelection = getUserAISelection(userId);
  if (userSelection) return userSelection;
  return getDefaultAISelection();
}

function listModelsForProvider(provider) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return [];
  return [...(PROVIDER_MODELS[normalizedProvider] ?? [])];
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// userId -> { count, windowStart, lastRequest }
const _rateLimitStore = new Map();

// userId -> { reason, bannedAt, bannedBy }
const _banStore = new Map();

// userId -> custom hourly credit limit (overrides HOURLY_MAX; 0 = no access)
const _userLimitStore = new Map();

function isOwner(userId) {
  return userId === OWNER_ID;
}

/**
 * Check without consuming. Returns { allowed: true, remaining } or { allowed: false, message }.
 */
function checkRateLimit(userId) {
  const selection = getEffectiveAISelection(userId);
  return checkRateLimitForSelection(userId, selection.provider, selection.model);
}

function checkRateLimitForSelection(userId, provider, model) {
  if (isOwner(userId)) return { allowed: true, remaining: Infinity, cost: 0 };

  const ban = getBan(userId);
  if (ban) {
    return { allowed: false, message: `You've been banned from using AI commands. Reason: **${ban.reason}**` };
  }

  const selection = normalizeSelection(provider, model) ?? getEffectiveAISelection(userId);
  const cost = getModelCreditCost(selection.provider, selection.model);
  const globalLimit = checkGlobalProviderLimit(selection.provider);
  if (!globalLimit.allowed) {
    return { allowed: false, message: globalLimit.message };
  }

  const now = Date.now();
  const entry = _rateLimitStore.get(userId) ?? { count: 0, windowStart: now, lastRequest: 0 };

  const sinceLastReq = now - entry.lastRequest;
  if (sinceLastReq < COOLDOWN_MS) {
    const secs = Math.ceil((COOLDOWN_MS - sinceLastReq) / 1000);
    return { allowed: false, message: `You're going too fast. Wait **${secs}s** before trying again.` };
  }

  const windowAge = now - entry.windowStart;
  const effectiveCount = windowAge >= HOUR_MS ? 0 : entry.count;
  const limit = getUserLimit(userId) ?? HOURLY_MAX;

  if (limit === 0) {
    return { allowed: false, message: `You don't have access to AI commands.` };
  }

  if (effectiveCount + cost > limit) {
    const resetMins = Math.ceil((HOUR_MS - windowAge) / 60_000);
    return {
      allowed: false,
      message: `Not enough AI credits. This model costs **${cost}** credit(s), but you have **${Math.max(0, limit - effectiveCount)}** left this hour. Resets in **${resetMins} min(s)**.`,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - effectiveCount - cost),
    cost,
    globalRemaining: Number.isFinite(globalLimit.remaining) ? globalLimit.remaining : null,
  };
}

function consumeRateLimit(userId) {
  const selection = getEffectiveAISelection(userId);
  consumeRateLimitForSelection(userId, selection.provider, selection.model);
}

function consumeRateLimitForSelection(userId, provider, model) {
  if (isOwner(userId)) return;

  const selection = normalizeSelection(provider, model) ?? getEffectiveAISelection(userId);
  const cost = getModelCreditCost(selection.provider, selection.model);

  const now = Date.now();
  const entry = _rateLimitStore.get(userId) ?? { count: 0, windowStart: now, lastRequest: 0 };

  if (now - entry.windowStart >= HOUR_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += cost;
  entry.lastRequest = now;
  _rateLimitStore.set(userId, entry);
  consumeGlobalProviderLimit(selection.provider);
}

function remainingUses(userId) {
  return remainingCredits(userId);
}

function remainingCredits(userId) {
  if (isOwner(userId)) return Infinity;

  const entry = _rateLimitStore.get(userId);
  const limit = getUserLimit(userId) ?? HOURLY_MAX;
  if (!entry) return limit;

  const windowAge = Date.now() - entry.windowStart;
  return windowAge >= HOUR_MS ? limit : Math.max(0, limit - entry.count);
}

// ─── Ban management ───────────────────────────────────────────────────────────
function banUser(userId, reason, bannedBy) {
  ensureModerationLoaded();
  _banStore.set(userId, { reason: reason || 'No reason given.', bannedAt: Date.now(), bannedBy });
  saveModeration();
}

function unbanUser(userId) {
  ensureModerationLoaded();
  const didDelete = _banStore.delete(userId);
  if (didDelete) saveModeration();
  return didDelete;
}

function getBan(userId) {
  ensureModerationLoaded();
  return _banStore.get(userId) ?? null;
}

function isBanned(userId) {
  ensureModerationLoaded();
  return _banStore.has(userId);
}

// ─── Per-user limit overrides ─────────────────────────────────────────────────
function setUserLimit(userId, limit) {
  ensureModerationLoaded();
  _userLimitStore.set(userId, limit);
  saveModeration();
}

function removeUserLimit(userId) {
  ensureModerationLoaded();
  const didDelete = _userLimitStore.delete(userId);
  if (didDelete) saveModeration();
  return didDelete;
}

function getUserLimit(userId) {
  ensureModerationLoaded();
  return _userLimitStore.has(userId) ? _userLimitStore.get(userId) : null;
}

function getAllRestrictions() {
  ensureModerationLoaded();
  const allIds = new Set([..._banStore.keys(), ..._userLimitStore.keys()]);
  return [...allIds].map((id) => ({
    userId: id,
    ban: getBan(id),
    customLimit: getUserLimit(id),
  }));
}

// ─── Conversation sessions ────────────────────────────────────────────────────
// userId -> { history: [{role, parts:[{text}]}], lastActivity }
const _sessions = new Map();

function getSession(userId) {
  const s = _sessions.get(userId);
  if (!s) return null;

  if (Date.now() - s.lastActivity > SESSION_TTL) {
    _sessions.delete(userId);
    return null;
  }
  return s;
}

function appendSession(userId, userText, modelText) {
  const s = getSession(userId) ?? { history: [], lastActivity: 0 };
  s.history.push({ role: 'user', parts: [{ text: userText }] });
  s.history.push({ role: 'model', parts: [{ text: modelText }] });
  s.lastActivity = Date.now();

  if (s.history.length > SESSION_TURNS * 2) {
    s.history = s.history.slice(-(SESSION_TURNS * 2));
  }
  _sessions.set(userId, s);
}

function clearSession(userId) {
  _sessions.delete(userId);
}

function sessionTurnCount(userId) {
  const s = getSession(userId);
  return s ? Math.floor(s.history.length / 2) : 0;
}

// ─── Channel history helpers ──────────────────────────────────────────────────
const CHANNEL_TYPE_LABELS = {
  [ChannelType.GuildText]: 'server text channel',
  [ChannelType.GuildVoice]: 'server voice channel (text)',
  [ChannelType.DM]: 'direct message',
  [ChannelType.GroupDM]: 'group DM',
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildAnnouncement]: 'announcement channel',
  [ChannelType.GuildForum]: 'forum channel',
  [ChannelType.GuildStageVoice]: 'stage channel',
  [ChannelType.GuildThread]: 'thread',
  [ChannelType.PublicThread]: 'public thread',
  [ChannelType.PrivateThread]: 'private thread',
  [ChannelType.AnnouncementThread]: 'announcement thread',
};

function channelTypeLabel(channel) {
  return channel ? (CHANNEL_TYPE_LABELS[channel.type] ?? 'unknown channel type') : 'unknown location';
}

async function fetchChannelHistory(interaction, limit = HISTORY_LIMIT) {
  try {
    const channel =
      interaction.channel ??
      (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel?.messages) return null;

    const fetched = await channel.messages.fetch({ limit, before: interaction.id });
    if (!fetched.size) return null;

    const sorted = [...fetched.values()].reverse();
    const lines = sorted
      .filter((m) => m.content || m.attachments.size || m.embeds.length)
      .map((m) => {
        const who = m.author.bot ? `[BOT] ${m.author.username}` : m.author.username;
        const attachmentNote = m.attachments.size ? ` [${m.attachments.size} attachment(s)]` : '';
        const embedNote = m.embeds.length ? ` [${m.embeds.length} embed(s)]` : '';
        const content = m.content ? m.content.replace(/\n+/g, ' ') : '(no text)';
        return `${who}: ${content}${attachmentNote}${embedNote}`;
      });

    return lines.length ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

// ─── Message splitting ────────────────────────────────────────────────────────
function splitMessage(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > MAX_CHARS) {
    const slice = remaining.slice(0, MAX_CHARS);
    const splitAt =
      slice.lastIndexOf('\n\n') > MAX_CHARS * 0.4 ? slice.lastIndexOf('\n\n') + 2
      : slice.lastIndexOf('\n') > MAX_CHARS * 0.4 ? slice.lastIndexOf('\n') + 1
      : slice.lastIndexOf(' ') > MAX_CHARS * 0.4 ? slice.lastIndexOf(' ') + 1
      : MAX_CHARS;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function sendWithRetry(fn, retries = 4, baseDelayMs = 800, options = {}) {
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;

      const geminiInfo = getGeminiRateLimitInfo(err);
      const delayMs = geminiInfo?.retryDelayMs ?? (baseDelayMs * (attempt + 1));
      const retryMeta = geminiInfo
        ? { reason: 'gemini-rate-limit', delayMs, gemini: geminiInfo }
        : { reason: 'generic-retry', delayMs };

      if (onRetry) {
        try {
          await onRetry({ attempt, error: err, ...retryMeta });
        } catch {
          // Swallow callback errors to avoid masking the original operation retry.
        }
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function parseDurationSecondsToMs(value) {
  const match = String(value ?? '').trim().match(/^([0-9]+(?:\.[0-9]+)?)s$/i);
  if (!match) return null;
  const sec = Number.parseFloat(match[1]);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.max(250, Math.ceil(sec * 1000));
}

function getGeminiRateLimitInfo(err) {
  if (!err || err.status !== 429) return null;

  const message = String(err.message ?? '');
  const details = Array.isArray(err.errorDetails) ? err.errorDetails : [];

  const looksGemini =
    message.includes('generativelanguage.googleapis.com') ||
    message.includes('Gemini') ||
    details.some((d) => typeof d?.['@type'] === 'string' && d['@type'].includes('google.rpc.RetryInfo'));

  if (!looksGemini) return null;

  let retryDelayMs = null;
  for (const detail of details) {
    if (detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
      retryDelayMs = parseDurationSecondsToMs(detail.retryDelay);
      if (retryDelayMs) break;
    }
  }

  if (!retryDelayMs) {
    const msgMatch = message.match(/Please retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    if (msgMatch) {
      retryDelayMs = Math.max(250, Math.ceil(Number.parseFloat(msgMatch[1]) * 1000));
    }
  }

  if (!retryDelayMs) retryDelayMs = 12_000;

  return {
    retryDelayMs,
    retryDelaySeconds: Number((retryDelayMs / 1000).toFixed(2)),
  };
}

function getContentFilterInfo(err) {
  if (!err || typeof err !== 'object') return null;

  const code = String(err.code ?? '').toLowerCase();
  const status = Number(err.status);
  const param = String(err.param ?? '').toLowerCase();
  const message = String(err.message ?? '');

  const inner = err.innererror && typeof err.innererror === 'object'
    ? err.innererror
    : (err.error && err.error.innererror && typeof err.error.innererror === 'object' ? err.error.innererror : null);
  const innerCode = String(inner?.code ?? '').toLowerCase();

  const looksFiltered =
    code === 'content_filter' ||
    innerCode === 'responsibleaipolicyviolation' ||
    /content management policy|response was filtered|content filtered|responsible ai/i.test(message);

  if (!looksFiltered) return null;

  const providerHint = /azure|openai/i.test(message)
    ? 'This model/provider blocked the response due to safety policy.'
    : 'The response was blocked by the model safety filter.';

  return {
    code: code || innerCode || 'content_filter',
    status: Number.isFinite(status) ? status : null,
    param: param || null,
    message,
    userMessage: `${providerHint} Try rewording your prompt, resetting chat context, or switching models.`,
  };
}

// ─── Provider callers ─────────────────────────────────────────────────────────
function historyText(historyEntry) {
  if (!historyEntry?.parts || !Array.isArray(historyEntry.parts)) return '';
  return historyEntry.parts.map((p) => p?.text ?? '').join('\n').trim();
}

async function callGemini(modelName, systemInstruction, userMessage, history = []) {
  if (!process.env.GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY is missing.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text().trim();
}

async function callGroq(modelName, systemInstruction, userMessage, history = []) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is missing.');
  }

  const messages = [
    { role: 'system', content: systemInstruction },
  ];

  for (const item of history) {
    const content = historyText(item);
    if (!content) continue;
    messages.push({ role: item.role === 'model' ? 'assistant' : 'user', content });
  }

  messages.push({ role: 'user', content: userMessage });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.7,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error (${response.status}): ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callGitHubModels(modelName, systemInstruction, userMessage, history = []) {
  const token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_MODELS_TOKEN (or GITHUB_TOKEN) is missing.');
  }

  const client = new OpenAI({
    apiKey: token,
    baseURL: 'https://models.github.ai/inference',
  });

  const messages = [
    { role: 'system', content: systemInstruction },
  ];

  for (const item of history) {
    const content = historyText(item);
    if (!content) continue;
    messages.push({ role: item.role === 'model' ? 'assistant' : 'user', content });
  }

  messages.push({ role: 'user', content: userMessage });

  const response = await client.chat.completions.create({
    model: modelName,
    messages,
    temperature: 0.7,
  });

  return response?.choices?.[0]?.message?.content?.trim() ?? '';
}

// ─── Unified AI caller ────────────────────────────────────────────────────────
/**
 * Call configured AI provider with optional multi-turn history.
 * @param {string} systemInstruction
 * @param {string} userMessage
 * @param {Array} history
 * @param {{ userId?: string, provider?: string, model?: string }} options
 * @returns {Promise<string>}
 */
async function callAI(systemInstruction, userMessage, history = [], options = {}) {
  const selection = options.provider && options.model
    ? normalizeSelection(options.provider, options.model)
    : getEffectiveAISelection(options.userId ?? 'global');

  if (!selection) {
    throw new Error('Invalid AI provider/model selection.');
  }

  if (selection.provider === AI_PROVIDERS.GEMINI) {
    return callGemini(selection.model, systemInstruction, userMessage, history);
  }

  if (selection.provider === AI_PROVIDERS.GROQ) {
    return callGroq(selection.model, systemInstruction, userMessage, history);
  }

  if (selection.provider === AI_PROVIDERS.GITHUB_MODELS) {
    return callGitHubModels(selection.model, systemInstruction, userMessage, history);
  }

  throw new Error(`Unsupported AI provider: ${selection.provider}`);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractToolEnvelope(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  // Try direct JSON first.
  const direct = safeJsonParse(trimmed);
  if (direct?.tool && typeof direct.tool === 'string') {
    return direct;
  }

  // Then try fenced json blocks.
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!blockMatch) return null;

  const inBlock = safeJsonParse(blockMatch[1].trim());
  if (inBlock?.tool && typeof inBlock.tool === 'string') {
    return inBlock;
  }

  return null;
}

function buildToolProtocol(tools = []) {
  if (!tools.length) return '';

  const lines = [
    'TOOLS',
    'You can call external tools when needed. If a tool is needed, reply with ONLY valid JSON in this exact shape:',
    '{"tool":"tool_name","arguments":{"key":"value"}}',
    'No markdown, no backticks, and no extra text in a tool call response.',
    'After tool output is provided, continue normally and answer the user.',
    'Available tools:',
  ];

  for (const tool of tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    if (tool.argumentsSchema) {
      lines.push(`  arguments schema: ${JSON.stringify(tool.argumentsSchema)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Call AI and allow explicit tool-call envelopes across providers.
 * @param {string} systemInstruction
 * @param {string} userMessage
 * @param {Array} history
 * @param {{ userId?: string, provider?: string, model?: string, maxToolCalls?: number }} options
 * @param {{ name: string, description: string, argumentsSchema?: object }[]} tools
 * @param {(name: string, args: object) => Promise<any>} executeTool
 * @returns {Promise<{ text: string, toolCalls: number }>} 
 */
async function callAIWithTools(systemInstruction, userMessage, history = [], options = {}, tools = [], executeTool) {
  const maxToolCalls = Number(options.maxToolCalls) > 0 ? Number(options.maxToolCalls) : 3;
  const toolMap = new Map((tools ?? []).map((t) => [t.name, t]));
  const workingHistory = Array.isArray(history) ? [...history] : [];

  let currentPrompt = userMessage;
  let toolCalls = 0;

  const protocol = buildToolProtocol(tools);
  const mergedSystemInstruction = protocol
    ? `${systemInstruction}\n\n${protocol}`
    : systemInstruction;

  while (true) {
    const output = await callAI(mergedSystemInstruction, currentPrompt, workingHistory, options);
    const envelope = extractToolEnvelope(output);

    if (!envelope || !envelope.tool || toolCalls >= maxToolCalls) {
      return { text: output, toolCalls };
    }

    const toolInfo = toolMap.get(envelope.tool);
    if (!toolInfo || typeof executeTool !== 'function') {
      return { text: output, toolCalls };
    }

    let toolResult;
    try {
      toolResult = await executeTool(envelope.tool, envelope.arguments ?? {});
      toolCalls += 1;
    } catch (err) {
      toolResult = {
        error: String(err?.message ?? err ?? 'Tool execution failed'),
      };
      toolCalls += 1;
    }

    workingHistory.push({ role: 'model', parts: [{ text: output }] });
    workingHistory.push({
      role: 'user',
      parts: [{
        text: `TOOL_RESULT ${envelope.tool}:\n${JSON.stringify(toolResult)}`,
      }],
    });

    currentPrompt = 'Use the TOOL_RESULT above to answer the user directly. If more tool data is required, call another tool.';
  }
}

// ─── System instruction builder ───────────────────────────────────────────────
function buildSystemInstruction(userId, mode = 'chat', provider = null) {
  const now = new Date();
  const datetime = now.toUTCString();
  const ownerUser = isOwner(userId);
  const activeProvider = provider ?? getEffectiveAISelection(userId).provider;

  const rateLimitNote = ownerUser
    ? 'The person asking is the bot owner and has no rate limits.'
    : `Non-owner users share ${HOURLY_MAX} AI credits/hour (cost depends on model) across all AI commands, with a ${COOLDOWN_MS / 1000}s cooldown between requests. Gemini models also share a global ${GLOBAL_GEMINI_DAILY_MAX}/day cap.`;

  const modeInstructions = {
    chat: 'You are a sharp, helpful AI assistant embedded in a Discord bot. Be conversational and natural.',
    roast: 'You are a witty roast comedian in a Discord bot. Deliver a single, punchy roast (3-6 sentences) of the described user based on the details given. Keep it playful, spicy but never hateful or discriminatory. End with a small compliment to soften the blow.',
    vibe: 'You are a fun, perceptive personality reader in a Discord bot. Based on the user profile details, give them a vibe check in 3-5 punchy sentences. Be playful and insightful. Do not be mean.',
    tldr: 'You are a concise Discord chat summariser. Summarise the provided chat history in a clear, punchy bullet list. Focus on topics discussed, notable moments, and overall vibe. Keep it to 5-10 bullets max.',
  };

  return `${modeInstructions[mode] ?? modeInstructions.chat}

ENVIRONMENT
- Platform: Discord (slash command / context menu interaction)
- Current date/time (UTC): ${datetime}
- Discord markdown is supported: **bold**, *italic*, \`code\`, \`\`\`blocks\`\`\`, > quotes, ### headings, - lists, ||spoilers||
- Keep responses concise enough for a few Discord messages.
- Do NOT wrap your whole reply in a code block unless the user specifically asks.

RATE LIMITS
${rateLimitNote}

BEHAVIOUR
- Be direct and honest. Say so if you do not know something.
- If asked what you are, say you are an AI assistant in a Discord bot powered by ${activeProvider}.
- You cannot take actions beyond responding, but you may use configured tools when available.`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Constants
  OWNER_ID,
  MODEL_NAME,
  HOURLY_MAX,
  COOLDOWN_MS,
  GLOBAL_GEMINI_DAILY_MAX,
  AI_PROVIDERS,
  PROVIDER_MODELS,
  MODEL_CREDIT_COST,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL_BY_PROVIDER,

  // AI provider settings
  getDefaultAISelection,
  setDefaultAISelection,
  getUserAISelection,
  setUserAISelection,
  resetUserAISelection,
  getEffectiveAISelection,
  listModelsForProvider,
  getModelCreditCost,
  getGlobalGeminiUsage,
  checkGlobalProviderLimit,

  // Rate limiting
  isOwner,
  checkRateLimit,
  checkRateLimitForSelection,
  consumeRateLimit,
  consumeRateLimitForSelection,
  remainingUses,
  remainingCredits,

  // Ban management
  banUser,
  unbanUser,
  getBan,
  isBanned,

  // Per-user limit overrides
  setUserLimit,
  removeUserLimit,
  getUserLimit,
  getAllRestrictions,

  // Sessions
  getSession,
  appendSession,
  clearSession,
  sessionTurnCount,

  // Channel
  channelTypeLabel,
  fetchChannelHistory,
  CHANNEL_TYPE_LABELS,

  // Helpers
  splitMessage,
  sendWithRetry,
  getGeminiRateLimitInfo,
  getContentFilterInfo,
  callAI,
  callAIWithTools,
  buildSystemInstruction,
};