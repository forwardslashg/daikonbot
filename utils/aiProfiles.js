const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const DATA_DIR = join(__dirname, '..', 'data');
const AI_PROFILES_FILE = join(DATA_DIR, 'ai-profiles.json');

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
    writeFileSync(AI_PROFILES_FILE, JSON.stringify(_profileCache, null, 2), 'utf8');
    return _profileCache;
  }

  try {
    const raw = readFileSync(AI_PROFILES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const users = parsed?.users && typeof parsed.users === 'object' ? parsed.users : {};
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

  writeFileSync(AI_PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

function sanitizeAniListUsername(username) {
  const value = String(username ?? '').trim();
  if (!value) return null;

  // AniList usernames are 2-20 chars and typically alphanumeric/_
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

function setAniListUsername(userId, username) {
  const sanitized = sanitizeAniListUsername(username);
  if (!sanitized) throw new Error('Invalid AniList username. Use 2-20 letters, numbers, or underscore.');

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

module.exports = {
  getUserProfile,
  getAniListUsername,
  setAniListUsername,
  clearAniListUsername,
  sanitizeAniListUsername,
};
