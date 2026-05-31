const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const DATA_DIR = join(__dirname, "..", "data");
const AI_PROFILES_FILE = join(DATA_DIR, "ai-profiles.json");

const VALID_MODES = [
  "chat",
  "roast",
  "vibe",
  "tldr",
  "unfiltered",
  "unfiltered+",
];

const DEFAULT_PROFILES = {
  users: {},
};

let _profileCache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureLoaded() {
  if (_profileCache) return _profileCache;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(AI_PROFILES_FILE)) {
    _profileCache = clone(DEFAULT_PROFILES);
    writeFileSync(
      AI_PROFILES_FILE,
      JSON.stringify(_profileCache, null, 2),
      "utf8",
    );
    return _profileCache;
  }

  try {
    const raw = readFileSync(AI_PROFILES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const users =
      parsed?.users && typeof parsed.users === "object" ? parsed.users : {};
    _profileCache = { users };
  } catch {
    _profileCache = clone(DEFAULT_PROFILES);
  }

  return _profileCache;
}

function save() {
  const profiles = ensureLoaded();

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(AI_PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf8");
}

function sanitizeAniListUsername(username) {
  const value = String(username ?? "").trim();
  if (!value) return null;

  if (!/^[A-Za-z0-9_]{2,20}$/.test(value)) return null;
  return value;
}

function getUserProfile(userId) {
  const profiles = ensureLoaded();
  const profile = profiles.users[userId];
  return profile ? clone(profile) : null;
}

function getAniListUsername(userId) {
  const profile = getUserProfile(userId);
  return profile?.anilistUsername ?? null;
}

function getUserMode(userId) {
  const profile = getUserProfile(userId);
  return profile?.mode ?? "chat";
}

function setUserMode(userId, mode) {
  const normalized = String(mode ?? "").toLowerCase();
  if (!VALID_MODES.includes(normalized))
    throw new Error(`Invalid mode "${mode}". Valid: ${VALID_MODES.join(", ")}`);

  const profiles = ensureLoaded();
  profiles.users[userId] = {
    ...(profiles.users[userId] ?? {}),
    mode: normalized,
    updatedAt: Date.now(),
  };
  save();
  return normalized;
}

function setAniListUsername(userId, username) {
  const sanitized = sanitizeAniListUsername(username);
  if (!sanitized)
    throw new Error(
      "Invalid AniList username. Use 2-20 letters, numbers, or underscore.",
    );

  const profiles = ensureLoaded();
  profiles.users[userId] = {
    ...(profiles.users[userId] ?? {}),
    anilistUsername: sanitized,
    updatedAt: Date.now(),
  };

  save();
  return sanitized;
}

function clearAniListUsername(userId) {
  const profiles = ensureLoaded();
  if (!profiles.users[userId]) return false;

  delete profiles.users[userId].anilistUsername;
  profiles.users[userId].updatedAt = Date.now();

  if (!Object.keys(profiles.users[userId]).length) {
    delete profiles.users[userId];
  }

  save();
  return true;
}

// ─── Unfiltered+ consent ──────────────────────────────────────────────────────
function hasUnfilteredPlusConsent(userId) {
  const profile = getUserProfile(userId);
  return profile?.unfilteredPlusConsent === true;
}

function setUnfilteredPlusConsent(userId, consented) {
  const profiles = ensureLoaded();
  const existing = profiles.users[userId] ?? {};
  if (consented) {
    existing.unfilteredPlusConsent = true;
    existing.unfilteredPlusConsentedAt = Date.now();
  } else {
    delete existing.unfilteredPlusConsent;
    delete existing.unfilteredPlusConsentedAt;
  }
  existing.updatedAt = Date.now();
  profiles.users[userId] = existing;
  save();
}

// ─── Memory notes (persistent facts) ─────────────────────────────────────────
// Each note: { text, source: 'auto'|'manual', category: string|null, timestamp }
const MAX_MEMORY_NOTES = 150;

function getMemoryNotes(userId) {
  const profile = getUserProfile(userId);
  return Array.isArray(profile?.memoryNotes) ? profile.memoryNotes : [];
}

/**
 * Add a persistent memory note for a user.
 * @param {string} userId
 * @param {string} text
 * @param {'auto'|'manual'} source
 * @param {string|null} category  - optional tag like 'preference', 'fact', 'name', etc.
 */
function addMemoryNote(userId, text, source = "auto", category = null) {
  const profiles = ensureLoaded();
  const existing = profiles.users[userId] ?? {};
  if (!Array.isArray(existing.memoryNotes)) existing.memoryNotes = [];

  const noteText = String(text ?? "")
    .trim()
    .slice(0, 500);
  if (!noteText) return null;

  // Dedup: skip if an identical note already exists
  if (existing.memoryNotes.some((n) => n.text === noteText)) return null;

  const note = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    text: noteText,
    source: source === "auto" ? "auto" : "manual",
    category: category ? String(category).slice(0, 40) : null,
    timestamp: Date.now(),
  };

  existing.memoryNotes.push(note);

  // Keep most recent MAX_MEMORY_NOTES; drop oldest auto notes first if over limit
  if (existing.memoryNotes.length > MAX_MEMORY_NOTES) {
    const autoIdxs = existing.memoryNotes
      .map((n, i) => ({ i, src: n.source }))
      .filter((x) => x.src === "auto")
      .map((x) => x.i);
    if (autoIdxs.length) {
      existing.memoryNotes.splice(autoIdxs[0], 1);
    } else {
      existing.memoryNotes.shift();
    }
  }

  existing.updatedAt = Date.now();
  profiles.users[userId] = existing;
  save();
  return note;
}

/**
 * Delete a specific memory note by its id or by 1-based index.
 * Returns true if deleted, false if not found.
 */
function deleteMemoryNote(userId, idOrIndex) {
  const profiles = ensureLoaded();
  const existing = profiles.users[userId];
  if (!existing || !Array.isArray(existing.memoryNotes)) return false;

  let idx = -1;
  if (typeof idOrIndex === "number") {
    // 1-based index
    idx = idOrIndex - 1;
  } else {
    idx = existing.memoryNotes.findIndex((n) => n.id === idOrIndex);
  }

  if (idx < 0 || idx >= existing.memoryNotes.length) return false;
  existing.memoryNotes.splice(idx, 1);
  existing.updatedAt = Date.now();
  save();
  return true;
}

function clearMemoryNotes(userId) {
  const profiles = ensureLoaded();
  if (profiles.users[userId]) {
    delete profiles.users[userId].memoryNotes;
    profiles.users[userId].updatedAt = Date.now();
    save();
  }
}

// ─── Persona system ───────────────────────────────────────────────────────────
/**
 * Persona shape:
 * {
 *   name: string,             // character/person name
 *   source: string|null,      // show/book/game/etc they're from, or 'real person'
 *   researchSummary: string,  // what was found via web search about them
 *   voiceNotes: string,       // how they speak, quirks, catchphrases, attitude
 *   setAt: number,            // timestamp
 *   setBy: string,            // userId who set it (same user, for record)
 * }
 */

function getPersona(userId) {
  const profile = getUserProfile(userId);
  return profile?.persona ?? null;
}

/**
 * Set a persona for the user's AI.
 */
function setPersona(
  userId,
  { name, source = null, researchSummary, voiceNotes },
) {
  if (!name || !researchSummary)
    throw new Error("Persona requires a name and researchSummary.");

  const profiles = ensureLoaded();
  const existing = profiles.users[userId] ?? {};
  existing.persona = {
    name: String(name).slice(0, 100),
    source: source ? String(source).slice(0, 100) : null,
    researchSummary: String(researchSummary).slice(0, 3000),
    voiceNotes: String(voiceNotes ?? "").slice(0, 1000),
    setAt: Date.now(),
    setBy: userId,
  };
  existing.updatedAt = Date.now();
  profiles.users[userId] = existing;
  save();
  return existing.persona;
}

function clearPersona(userId) {
  const profiles = ensureLoaded();
  const existing = profiles.users[userId];
  if (!existing?.persona) return false;
  delete existing.persona;
  existing.updatedAt = Date.now();
  save();
  return true;
}

module.exports = {
  getUserProfile,
  getAniListUsername,
  setAniListUsername,
  clearAniListUsername,
  sanitizeAniListUsername,
  getUserMode,
  setUserMode,
  VALID_MODES,
  hasUnfilteredPlusConsent,
  setUnfilteredPlusConsent,
  // Memory
  getMemoryNotes,
  addMemoryNote,
  deleteMemoryNote,
  clearMemoryNotes,
  MAX_MEMORY_NOTES,
  // Persona
  getPersona,
  setPersona,
  clearPersona,
};
