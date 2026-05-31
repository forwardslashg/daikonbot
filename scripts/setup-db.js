#!/usr/bin/env node
/**
 * One-time (idempotent) Appwrite database setup.
 * Run: npm run setup-db
 */
require("dotenv").config();
const { Client, Databases } = require("node-appwrite");

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || "daikonbot";

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error(
    "Missing Appwrite env vars. Copy .env.example to .env and fill in values.",
  );
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);
const databases = new Databases(client);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryCreate(fn, label) {
  try {
    const result = await fn();
    console.log(`  ✓ Created ${label}`);
    return result;
  } catch (err) {
    if (err?.code === 409) {
      console.log(`  · Already exists: ${label}`);
    } else {
      console.error(`  ✗ Failed ${label}:`, err?.message ?? err);
      throw err;
    }
  }
}

async function main() {
  console.log(`\nSetting up Appwrite database: "${DB_ID}"\n`);

  // ── Database ──────────────────────────────────────────────────────────────
  await tryCreate(
    () => databases.create(DB_ID, "Daikonbot"),
    `database "${DB_ID}"`,
  );

  // ── profiles collection ───────────────────────────────────────────────────
  try {
    await databases.deleteCollection(DB_ID, "profiles");
    console.log("  · Deleted old: profiles");
  } catch {}

  await tryCreate(
    () => databases.createCollection(DB_ID, "profiles", "profiles"),
    "collection: profiles",
  );
  for (const [key, size] of [
    ["userId", 36],
    ["data", 9999],
  ]) {
    await tryCreate(
      () =>
        databases.createStringAttribute(
          DB_ID,
          "profiles",
          key,
          size,
          key === "userId",
        ),
      `profiles.${key}`,
    );
    await sleep(300);
  }
  await tryCreate(
    () =>
      databases.createIndex(
        DB_ID,
        "profiles",
        "userId_idx",
        "key",
        ["userId"],
        ["ASC"],
      ),
    "profiles index: userId",
  );

  // ── reminders collection ──────────────────────────────────────────────────
  await tryCreate(
    () => databases.createCollection(DB_ID, "reminders", "reminders"),
    "collection: reminders",
  );
  for (const [key, size, req] of [
    ["reminderId", 36, true],
    ["userId", 36, true],
    ["channelId", 36, true],
    ["guildId", 36, false],
    ["text", 500, true],
    ["done", 5, false],
  ]) {
    await tryCreate(
      () => databases.createStringAttribute(DB_ID, "reminders", key, size, req),
      `reminders.${key}`,
    );
    await sleep(200);
  }
  await tryCreate(
    () => databases.createIntegerAttribute(DB_ID, "reminders", "fireAt", true),
    "reminders.fireAt",
  );
  await sleep(200);
  await tryCreate(
    () =>
      databases.createIntegerAttribute(DB_ID, "reminders", "createdAt", false),
    "reminders.createdAt",
  );
  await sleep(500);
  await tryCreate(
    () =>
      databases.createIndex(
        DB_ID,
        "reminders",
        "userId_done_idx",
        "key",
        ["userId", "done"],
        ["ASC", "ASC"],
      ),
    "reminders index: userId+done",
  );
  await tryCreate(
    () =>
      databases.createIndex(
        DB_ID,
        "reminders",
        "fireAt_done_idx",
        "key",
        ["fireAt", "done"],
        ["ASC", "ASC"],
      ),
    "reminders index: fireAt+done",
  );

  // ── ai_settings collection ────────────────────────────────────────────────
  await tryCreate(
    () => databases.createCollection(DB_ID, "ai_settings", "ai_settings"),
    "collection: ai_settings",
  );
  for (const [key, size, req] of [
    ["settingKey", 80, true],
    ["provider", 40, false],
    ["model", 80, false],
    ["extra", 9999, false],
  ]) {
    await tryCreate(
      () =>
        databases.createStringAttribute(DB_ID, "ai_settings", key, size, req),
      `ai_settings.${key}`,
    );
    await sleep(200);
  }
  await sleep(300);
  await tryCreate(
    () =>
      databases.createIndex(
        DB_ID,
        "ai_settings",
        "settingKey_idx",
        "key",
        ["settingKey"],
        ["ASC"],
      ),
    "ai_settings index: settingKey",
  );

  // ── ai_moderation collection ──────────────────────────────────────────────
  await tryCreate(
    () => databases.createCollection(DB_ID, "ai_moderation", "ai_moderation"),
    "collection: ai_moderation",
  );
  for (const [key, size, req] of [
    ["userId", 36, true],
    ["type", 20, true],
    ["reason", 300, false],
    ["bannedBy", 36, false],
    ["value", 40, false],
  ]) {
    await tryCreate(
      () =>
        databases.createStringAttribute(DB_ID, "ai_moderation", key, size, req),
      `ai_moderation.${key}`,
    );
    await sleep(200);
  }
  await tryCreate(
    () =>
      databases.createIntegerAttribute(
        DB_ID,
        "ai_moderation",
        "createdAt",
        false,
      ),
    "ai_moderation.createdAt",
  );
  await sleep(300);
  await tryCreate(
    () =>
      databases.createIndex(
        DB_ID,
        "ai_moderation",
        "userId_type_idx",
        "key",
        ["userId", "type"],
        ["ASC", "ASC"],
      ),
    "ai_moderation index: userId+type",
  );

  console.log("\n✅ Database setup complete.\n");
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err?.message ?? err);
  process.exit(1);
});
