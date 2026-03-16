const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
require('dotenv').config();
const { isOwner } = require('./utils/aiEngine');

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Set it in your environment or .env file.');
  process.exit(1);
}

// ─── Global command rate limiter (non-owners: 3 commands per 10 seconds) ─────
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10_000;
const _globalCmdBuckets = new Map(); // userId -> { count, resetAt }

function checkGlobalRateLimit(userId) {
  if (isOwner(userId)) return { allowed: true };

  const now = Date.now();
  const bucket = _globalCmdBuckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    _globalCmdBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in Discord dev portal
  ],
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SHUTDOWN] Received ${signal}. Closing Discord client...`);
  try {
    await client.destroy();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
});

// ─── Load commands ────────────────────────────────────────────────────────────
client.commands = new Collection();

const commandFiles = readdirSync(join(__dirname, 'commands')).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(join(__dirname, 'commands', file));

  if (!command.data || !command.execute) {
    console.warn(`[WARN] ${file} is missing 'data' or 'execute' — skipping.`);
    continue;
  }

  client.commands.set(command.data.name, command);
  console.log(`[CMD] Loaded /${command.data.name}`);
}

// ─── Events ───────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});

// Lazy-load AI interaction handlers (buttons + modals) from the ai command
function getAICommand() {
  return client.commands.get('ai');
}

async function safeReplyError(interaction, label) {
  console.error(`[ERROR] ${label}:`, ...arguments);
  const msg = { content: 'Something went wrong while running that command.', ephemeral: true };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
  } catch {}
}

client.on('interactionCreate', async (interaction) => {
  // ── Slash commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[WARN] Unknown slash command: ${interaction.commandName}`);
      return;
    }
    const rateCheck = checkGlobalRateLimit(interaction.user.id);
    if (!rateCheck.allowed) {
      await interaction.reply({
        content: `You're using commands too fast. Please wait **${rateCheck.retryAfter}s** before trying again.`,
        ephemeral: true,
      });
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      await safeReplyError(interaction, `/${interaction.commandName}`, err);
    }
    return;
  }

  // ── User context menu commands (right-click on a user) ─────────────────────
  if (interaction.isUserContextMenuCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[WARN] Unknown context menu: ${interaction.commandName}`);
      return;
    }
    const rateCheck = checkGlobalRateLimit(interaction.user.id);
    if (!rateCheck.allowed) {
      await interaction.reply({
        content: `You're using commands too fast. Please wait **${rateCheck.retryAfter}s** before trying again.`,
        ephemeral: true,
      });
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      await safeReplyError(interaction, `ctx:${interaction.commandName}`, err);
    }
    return;
  }

  // ── Button interactions ─────────────────────────────────────────────────────
  if (interaction.isButton()) {
    // AI conversation buttons
    if (interaction.customId.startsWith('ai_')) {
      const aiCmd = getAICommand();
      if (aiCmd?.handleButton) {
        try {
          await aiCmd.handleButton(interaction);
        } catch (err) {
          await safeReplyError(interaction, `btn:${interaction.customId}`, err);
        }
      }
    }
    return;
  }

  // ── Modal submissions ───────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('ai_modal:')) {
      const aiCmd = getAICommand();
      if (aiCmd?.handleModal) {
        try {
          await aiCmd.handleModal(interaction);
        } catch (err) {
          await safeReplyError(interaction, `modal:${interaction.customId}`, err);
        }
      }
    }
    return;
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
