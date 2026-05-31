/**
 * Persistent reminder system.
 * Reminders are stored in data/reminders.json and delivered via the Discord client
 * by the scheduler started in index.js.
 *
 * Each reminder: { id, userId, channelId, guildId, text, fireAt, createdAt, done }
 */

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const DATA_DIR  = join(__dirname, '..', 'data');
const FILE      = join(DATA_DIR, 'reminders.json');
const CHECK_INTERVAL_MS = 15_000; // check every 15 seconds
const MAX_PER_USER      = 20;     // max active reminders per user

// ─── Persistence ──────────────────────────────────────────────────────────────
let _cache = null;

function _load() {
  if (_cache) return _cache;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) {
    _cache = [];
    _save();
    return _cache;
  }
  try {
    const raw = readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    _cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    _cache = [];
  }
  return _cache;
}

function _save() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(_cache ?? [], null, 2), 'utf8');
}

function _genId() {
  return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a reminder.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.channelId
 * @param {string|null} opts.guildId
 * @param {string} opts.text     - what to remind about
 * @param {number} opts.fireAt   - Unix ms timestamp
 * @returns {{ id: string, fireAt: number } | { error: string }}
 */
function addReminder({ userId, channelId, guildId, text, fireAt }) {
  const reminders = _load();
  const active = reminders.filter((r) => r.userId === userId && !r.done);
  if (active.length >= MAX_PER_USER) {
    return { error: `You already have ${active.length} active reminder(s). Cancel some first (max ${MAX_PER_USER}).` };
  }
  if (typeof fireAt !== 'number' || isNaN(fireAt) || fireAt <= Date.now()) {
    return { error: 'Reminder time must be in the future.' };
  }
  const id = _genId();
  reminders.push({
    id,
    userId,
    channelId,
    guildId: guildId ?? null,
    text: String(text ?? '').trim().slice(0, 500) || 'Reminder!',
    fireAt,
    createdAt: Date.now(),
    done: false,
  });
  _save();
  return { id, fireAt };
}

/**
 * List active (not yet fired) reminders for a user.
 */
function listReminders(userId) {
  const reminders = _load();
  return reminders.filter((r) => r.userId === userId && !r.done);
}

/**
 * Cancel a reminder by id. Returns true if it was found and owned by userId.
 */
function cancelReminder(userId, id) {
  const reminders = _load();
  const idx = reminders.findIndex((r) => r.id === id && r.userId === userId && !r.done);
  if (idx === -1) return false;
  reminders[idx].done = true;
  _save();
  return true;
}

/**
 * Get all due reminders (fireAt <= now, done=false). Marks them done.
 */
function popDueReminders() {
  const reminders = _load();
  const now = Date.now();
  const due = reminders.filter((r) => !r.done && r.fireAt <= now);
  if (due.length) {
    for (const r of due) r.done = true;
    _save();
  }
  return due;
}

/**
 * Clear all done reminders older than 7 days (maintenance).
 */
function pruneOld() {
  const reminders = _load();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const before = reminders.length;
  _cache = reminders.filter((r) => !r.done || r.fireAt > cutoff);
  if (_cache.length !== before) _save();
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Start the reminder delivery loop. Call once from index.js with the Discord client.
 * @param {import('discord.js').Client} client
 */
function startReminderScheduler(client) {
  setInterval(async () => {
    let due;
    try { due = popDueReminders(); } catch { return; }
    if (!due.length) return;

    for (const rem of due) {
      try {
        const channel = await client.channels.fetch(rem.channelId).catch(() => null);
        if (!channel?.send) continue;
        await channel.send(
          `⏰ <@${rem.userId}> **Reminder:** ${rem.text}`,
        );
      } catch (err) {
        console.error(`[REMINDERS] Failed to deliver reminder ${rem.id}:`, err?.message ?? err);
      }
    }

    // Prune stale entries periodically
    try { pruneOld(); } catch {}
  }, CHECK_INTERVAL_MS);

  console.log('[REMINDERS] Scheduler started (checking every 15s)');
}

/**
 * Parse natural-language duration strings into milliseconds.
 * Supports "in 10 minutes", "in 2 hours", "in 1 day", "in 30 seconds", etc.
 * Returns null if unparseable.
 */
function parseDurationMs(input) {
  const s = String(input ?? '').trim().toLowerCase();

  // Absolute: "at HH:MM" or "at HH:MM:SS" (today, UTC)
  const atMatch = s.match(/^at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?$/);
  if (atMatch) {
    let h = parseInt(atMatch[1], 10);
    const m = parseInt(atMatch[2], 10);
    const sec = atMatch[3] ? parseInt(atMatch[3], 10) : 0;
    if (atMatch[4] === 'pm' && h < 12) h += 12;
    if (atMatch[4] === 'am' && h === 12) h = 0;
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, sec));
    if (target.getTime() <= Date.now()) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - Date.now();
  }

  // Relative: "in X unit" or "X unit"
  const rel = s.replace(/^in\s+/, '');
  const parts = rel.matchAll(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)/g);
  let totalMs = 0;
  let matched = false;
  for (const [, num, unit] of parts) {
    matched = true;
    const n = parseFloat(num);
    if (unit.startsWith('s')) totalMs += n * 1000;
    else if (unit.startsWith('mi') || unit === 'm') totalMs += n * 60_000;
    else if (unit.startsWith('h')) totalMs += n * 3_600_000;
    else if (unit.startsWith('d')) totalMs += n * 86_400_000;
    else if (unit.startsWith('w')) totalMs += n * 7 * 86_400_000;
  }
  return matched && totalMs > 0 ? totalMs : null;
}

module.exports = {
  addReminder,
  listReminder: listReminders,
  listReminders,
  cancelReminder,
  popDueReminders,
  startReminderScheduler,
  parseDurationMs,
  MAX_PER_USER,
};
