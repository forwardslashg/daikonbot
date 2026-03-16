const { REST, Routes } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. Set them in your environment or .env file.');
  process.exit(1);
}

// ─── Collect command JSON from every file in commands/ ────────────────────────
const commands = [];
const commandFiles = readdirSync(join(__dirname, 'commands')).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(join(__dirname, 'commands', file));

  if (!command.data) {
    console.warn(`[WARN] ${file} is missing 'data' — skipping.`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`[CMD] Queued /${command.data.name}`);
}

// ─── Push to Discord ──────────────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} command(s) globally...`);

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully registered commands.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
