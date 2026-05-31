/**
 * Appwrite database client.
 * All collections are created by scripts/setup-db.js.
 * Gracefully returns mock objects if env vars are not set.
 */
let client, db, Query, ID;

const COLLECTIONS = {
  PROFILES: "profiles",
  REMINDERS: "reminders",
  AI_SETTINGS: "ai_settings",
  AI_MOD: "ai_moderation",
};

const DB_ID = process.env.APPWRITE_DATABASE_ID || "daikonbot";

if (
  process.env.APPWRITE_ENDPOINT &&
  process.env.APPWRITE_PROJECT_ID &&
  process.env.APPWRITE_API_KEY
) {
  const { Client, Databases } = require("node-appwrite");
  Query = require("node-appwrite").Query;
  ID = require("node-appwrite").ID;
  client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  db = new Databases(client);
} else {
  console.warn(
    "[DB] Appwrite not configured — data will not persist across restarts.",
  );
  // Stub so imports don't crash
  Query = {};
  ID = { unique: () => "mock" };
  const mockDb = {
    listDocuments: async () => ({ documents: [], total: 0 }),
    createDocument: async () => ({}),
    updateDocument: async () => ({}),
    deleteDocument: async () => ({}),
  };
  db = mockDb;
}

module.exports = { client, db, DB_ID, COLLECTIONS, Query, ID };
