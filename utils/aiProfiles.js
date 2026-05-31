/**
 * User AI profiles — backed by Appwrite.
 * All variable data stored in a single 'data' JSON blob: { mode, anilistUsername, unfilteredConsent, memoryNotes[], persona }
 */
const { db, DB_ID, COLLECTIONS, Query, ID } = require("./db");

const VALID_MODES = [
  "chat",
  "roast",
  "vibe",
  "tldr",
  "unfiltered",
  "unfiltered+",
];
const MAX_MEMORY_NOTES = 150;
const COL = COLLECTIONS.PROFILES;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getDoc(userId) {
  try {
    const result = await db.listDocuments(DB_ID, COL, [
      Query.equal("userId", userId),
      Query.limit(1),
    ]);
    return result.documents[0] ?? null;
  } catch {
    return null;
  }
}

async function _upsert(userId, data) {
  const doc = await _getDoc(userId);
  const payload = { userId, data: JSON.stringify(data) };
  if (doc) {
    return db.updateDocument(DB_ID, COL, doc.$id, payload);
  } else {
    return db.createDocument(DB_ID, COL, ID.unique(), payload);
  }
}

function _getData(doc) {
  if (!doc?.data) return {};
  try {
    return JSON.parse(doc.data);
  } catch {
    return {};
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getUserProfile(userId) {
  const doc = await _getDoc(userId);
  if (!doc) return null;
  const d = _getData(doc);
  return {
    userId: doc.userId,
    mode: d.mode ?? "chat",
    anilistUsername: d.anilistUsername ?? null,
    unfilteredPlusConsent: d.unfilteredConsent === true,
    memoryNotes: d.memoryNotes ?? [],
    persona: d.persona ?? null,
  };
}

// ─── AniList ──────────────────────────────────────────────────────────────────

function sanitizeAniListUsername(username) {
  const value = String(username ?? "").trim();
  if (!value || !/^[A-Za-z0-9_]{2,20}$/.test(value)) return null;
  return value;
}

async function getAniListUsername(userId) {
  const doc = await _getDoc(userId);
  return _getData(doc).anilistUsername ?? null;
}

async function setAniListUsername(userId, username) {
  const sanitized = sanitizeAniListUsername(username);
  if (!sanitized)
    throw new Error(
      "Invalid AniList username. Use 2-20 letters, numbers, or underscore.",
    );
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  d.anilistUsername = sanitized;
  await _upsert(userId, d);
  return sanitized;
}

async function clearAniListUsername(userId) {
  const doc = await _getDoc(userId);
  if (!doc) return false;
  const d = _getData(doc);
  delete d.anilistUsername;
  await _upsert(userId, d);
  return true;
}

// ─── Mode ─────────────────────────────────────────────────────────────────────

async function getUserMode(userId) {
  const doc = await _getDoc(userId);
  return _getData(doc).mode ?? "chat";
}

async function setUserMode(userId, mode) {
  const normalized = String(mode ?? "").toLowerCase();
  if (!VALID_MODES.includes(normalized))
    throw new Error(`Invalid mode "${mode}". Valid: ${VALID_MODES.join(", ")}`);
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  d.mode = normalized;
  await _upsert(userId, d);
  return normalized;
}

// ─── Unfiltered+ consent ──────────────────────────────────────────────────────

async function hasUnfilteredPlusConsent(userId) {
  const doc = await _getDoc(userId);
  return _getData(doc).unfilteredConsent === true;
}

async function setUnfilteredPlusConsent(userId, consented) {
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  d.unfilteredConsent = consented;
  await _upsert(userId, d);
}

// ─── Memory notes ─────────────────────────────────────────────────────────────

async function getMemoryNotes(userId) {
  const doc = await _getDoc(userId);
  return _getData(doc).memoryNotes ?? [];
}

async function addMemoryNote(userId, text, source = "auto", category = null) {
  const noteText = String(text ?? "")
    .trim()
    .slice(0, 500);
  if (!noteText) return null;

  const doc = await _getDoc(userId);
  const d = _getData(doc);
  if (!Array.isArray(d.memoryNotes)) d.memoryNotes = [];
  if (d.memoryNotes.some((n) => n.text === noteText)) return null;

  const note = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    text: noteText,
    source: source === "auto" ? "auto" : "manual",
    category: category ? String(category).slice(0, 40) : null,
    timestamp: Date.now(),
  };

  d.memoryNotes.push(note);

  if (d.memoryNotes.length > MAX_MEMORY_NOTES) {
    const autoIdx = d.memoryNotes.findIndex((n) => n.source === "auto");
    if (autoIdx >= 0) d.memoryNotes.splice(autoIdx, 1);
    else d.memoryNotes.shift();
  }

  await _upsert(userId, d);
  return note;
}

async function deleteMemoryNote(userId, idOrIndex) {
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  if (!Array.isArray(d.memoryNotes)) return false;
  let idx = -1;
  if (typeof idOrIndex === "number") idx = idOrIndex - 1;
  else idx = d.memoryNotes.findIndex((n) => n.id === idOrIndex);
  if (idx < 0 || idx >= d.memoryNotes.length) return false;
  d.memoryNotes.splice(idx, 1);
  await _upsert(userId, d);
  return true;
}

async function clearMemoryNotes(userId) {
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  d.memoryNotes = [];
  await _upsert(userId, d);
}

// ─── Persona ──────────────────────────────────────────────────────────────────

async function getPersona(userId) {
  const doc = await _getDoc(userId);
  return _getData(doc).persona ?? null;
}

async function setPersona(
  userId,
  { name, source = null, researchSummary, voiceNotes },
) {
  if (!name || !researchSummary)
    throw new Error("Persona requires a name and researchSummary.");
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  d.persona = {
    name: String(name).slice(0, 100),
    source: source ? String(source).slice(0, 100) : null,
    researchSummary: String(researchSummary).slice(0, 3000),
    voiceNotes: String(voiceNotes ?? "").slice(0, 1000),
    setAt: Date.now(),
  };
  await _upsert(userId, d);
  return d.persona;
}

async function clearPersona(userId) {
  const doc = await _getDoc(userId);
  const d = _getData(doc);
  if (!d.persona) return false;
  delete d.persona;
  await _upsert(userId, d);
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
  getMemoryNotes,
  addMemoryNote,
  deleteMemoryNote,
  clearMemoryNotes,
  MAX_MEMORY_NOTES,
  getPersona,
  setPersona,
  clearPersona,
};
