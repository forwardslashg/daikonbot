require("dotenv").config();

const required = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "GOOGLE_AI_KEY",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
];

const optional = ["APPWRITE_DATABASE_ID", "NODE_ENV"];

const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.error("❌ Missing required environment variables:");
  for (const k of missing) console.error(`   - ${k}`);
  console.error("\nCopy .env.example to .env and fill in the values.");
  process.exit(1);
}

console.log("✅ All required environment variables are present.");
for (const k of optional) {
  if (process.env[k]) console.log(`   ${k} = ${process.env[k]}`);
}
