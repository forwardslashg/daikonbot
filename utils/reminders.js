/**
 * Persistent reminder system — backed by Appwrite.
 */
const { db, DB_ID, COLLECTIONS, Query, ID } = require("./db");

const COL = COLLECTIONS.REMINDERS;
const CHECK_INTERVAL_MS = 15_000;
const MAX_PER_USER = 20;

function _genId() {
  return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

async function addReminder({ userId, channelId, guildId, text, fireAt }) {
  if (typeof fireAt !== "number" || isNaN(fireAt) || fireAt <= Date.now()) {
    return { error: "Reminder time must be in the future." };
  }

  const existing = await db.listDocuments(DB_ID, COL, [
    Query.equal("userId", userId),
    Query.equal("done", "false"),
    Query.limit(MAX_PER_USER + 1),
  ]);
  if (existing.total >= MAX_PER_USER) {
    return {
      error: `You already have ${existing.total} active reminder(s). Cancel some first (max ${MAX_PER_USER}).`,
    };
  }

  const reminderId = _genId();
  await db.createDocument(DB_ID, COL, ID.unique(), {
    reminderId,
    userId,
    channelId,
    guildId: guildId ?? null,
    text:
      String(text ?? "")
        .trim()
        .slice(0, 500) || "Reminder!",
    fireAt,
    createdAt: Date.now(),
    done: "false",
  });
  return { id: reminderId, fireAt };
}

async function listReminders(userId) {
  const result = await db.listDocuments(DB_ID, COL, [
    Query.equal("userId", userId),
    Query.equal("done", "false"),
    Query.orderAsc("fireAt"),
    Query.limit(MAX_PER_USER),
  ]);
  return result.documents.map((d) => ({
    id: d.reminderId,
    userId: d.userId,
    channelId: d.channelId,
    guildId: d.guildId,
    text: d.text,
    fireAt: d.fireAt,
    createdAt: d.createdAt,
    done: d.done === "true",
    _docId: d.$id,
  }));
}

async function cancelReminder(userId, id) {
  const result = await db.listDocuments(DB_ID, COL, [
    Query.equal("userId", userId),
    Query.equal("reminderId", id),
    Query.equal("done", "false"),
    Query.limit(1),
  ]);
  if (!result.documents.length) return false;
  await db.updateDocument(DB_ID, COL, result.documents[0].$id, {
    done: "true",
  });
  return true;
}

async function popDueReminders() {
  const now = Date.now();
  const result = await db.listDocuments(DB_ID, COL, [
    Query.equal("done", "false"),
    Query.lessThanEqual("fireAt", now),
    Query.limit(50),
  ]);
  const due = result.documents;
  for (const doc of due) {
    await db
      .updateDocument(DB_ID, COL, doc.$id, { done: "true" })
      .catch(() => {});
  }
  return due.map((d) => ({
    id: d.reminderId,
    userId: d.userId,
    channelId: d.channelId,
    text: d.text,
  }));
}

function startReminderScheduler(client) {
  setInterval(async () => {
    let due;
    try {
      due = await popDueReminders();
    } catch {
      return;
    }
    if (!due.length) return;

    for (const rem of due) {
      try {
        // Try original channel first (guild text channel)
        const channel = await client.channels
          .fetch(rem.channelId)
          .catch(() => null);
        if (channel?.send) {
          await channel.send(`⏰ <@${rem.userId}> **Reminder:** ${rem.text}`);
          continue;
        }
      } catch {}

      // Fallback: DM the user directly (user-installed bot)
      try {
        const user = await client.users.fetch(rem.userId).catch(() => null);
        if (user) {
          await user.send(`⏰ **Reminder:** ${rem.text}`);
        }
      } catch (err) {
        console.error(
          `[REMINDERS] Failed to deliver ${rem.id}:`,
          err?.message ?? err,
        );
      }
    }
  }, CHECK_INTERVAL_MS);

  console.log("[REMINDERS] Scheduler started (checking every 15s)");
}

/**
 * Parse natural-language duration strings into milliseconds.
 * Supports "in 10 minutes", "in 2 hours", "in 1 day", "in 30 seconds", etc.
 * Returns null if unparseable.
 */
function parseDurationMs(input) {
  const s = String(input ?? "")
    .trim()
    .toLowerCase();

  const atMatch = s.match(
    /^at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?$/,
  );
  if (atMatch) {
    let h = parseInt(atMatch[1], 10);
    const m = parseInt(atMatch[2], 10);
    const sec = atMatch[3] ? parseInt(atMatch[3], 10) : 0;
    if (atMatch[4] === "pm" && h < 12) h += 12;
    if (atMatch[4] === "am" && h === 12) h = 0;
    const now = new Date();
    const target = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        m,
        sec,
      ),
    );
    if (target.getTime() <= Date.now())
      target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - Date.now();
  }

  const rel = s.replace(/^in\s+/, "");
  const parts = rel.matchAll(
    /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)/g,
  );
  let totalMs = 0;
  let matched = false;
  for (const [, num, unit] of parts) {
    matched = true;
    const n = parseFloat(num);
    if (unit.startsWith("s")) totalMs += n * 1000;
    else if (unit.startsWith("mi") || unit === "m") totalMs += n * 60_000;
    else if (unit.startsWith("h")) totalMs += n * 3_600_000;
    else if (unit.startsWith("d")) totalMs += n * 86_400_000;
    else if (unit.startsWith("w")) totalMs += n * 7 * 86_400_000;
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
