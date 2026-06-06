const { Client, Collection, GatewayIntentBits, SectionBuilder } = require("discord.js");
const { readdirSync } = require("fs");
const { join } = require("path");
require("dotenv").config();
const { isOwner, initAIStorage } = require("./utils/aiEngine");
const { startReminderScheduler } = require("./utils/reminders");

// Monkeypatch SectionBuilder to allow optional/undefined accessories (V2 Components API compatibility fix)
SectionBuilder.prototype.toJSON = function() {
  return {
    type: 9,
    components: this.components.map((component) => component.toJSON()),
    accessory: this.accessory ? this.accessory.toJSON() : undefined
  };
};

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "Missing DISCORD_TOKEN. Set it in your environment or .env file.",
  );
  process.exit(1);
}

// ─── Global command rate limiter (non-owners: 3 commands per 10 seconds) ─────
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10_000;
const _globalCmdBuckets = new Map();

function checkGlobalRateLimit(userId) {
  if (isOwner(userId)) return { allowed: true };

  const now = Date.now();
  const bucket = _globalCmdBuckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    _globalCmdBuckets.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) =>
  console.error("[UNHANDLED_REJECTION]", reason),
);
process.on("uncaughtException", (err) =>
  console.error("[UNCAUGHT_EXCEPTION]", err),
);

// ─── Load commands ────────────────────────────────────────────────────────────
client.commands = new Collection();

const commandFiles = readdirSync(join(__dirname, "commands")).filter((f) =>
  f.endsWith(".js"),
);

for (const file of commandFiles) {
  const command = require(join(__dirname, "commands", file));
  if (!command.data || !command.execute) {
    console.warn(`[WARN] ${file} is missing 'data' or 'execute' — skipping.`);
    continue;
  }
  client.commands.set(command.data.name, command);
  console.log(`[CMD] Loaded /${command.data.name}`);
}

// ─── Events ───────────────────────────────────────────────────────────────────
client.once("clientReady", () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
  startReminderScheduler(client);
});

async function safeReplyError(interaction, label) {
  console.error(`[ERROR] ${label}:`, ...arguments);
  const msg = {
    content: "Something went wrong while running that command.",
    ephemeral: true,
  };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
  } catch {}
}

client.on("interactionCreate", async (interaction) => {
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

  // ── Context menu commands (right-click on user/message) ────────────────────
  if (
    interaction.isUserContextMenuCommand() ||
    interaction.isMessageContextMenuCommand()
  ) {
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

  // ── Button interactions (aimodel only) ─────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("aimodel_")) {
    const aimodelCmd = client.commands.get("aimodel");
    if (aimodelCmd?.handleButton) {
      try {
        await aimodelCmd.handleButton(interaction);
      } catch (err) {
        await safeReplyError(interaction, `btn:${interaction.customId}`, err);
      }
    }
    return;
  }

  // ── String select menus (aimodel only) ─────────────────────────────────────
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("aimodel_")
  ) {
    const aimodelCmd = client.commands.get("aimodel");
    if (aimodelCmd?.handleSelectMenu) {
      try {
        await aimodelCmd.handleSelectMenu(interaction);
      } catch (err) {
        await safeReplyError(
          interaction,
          `select:${interaction.customId}`,
          err,
        );
      }
    }
    return;
  }

  // ── Everything else (unused modals, other buttons) ─────────────────────────
});

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  await initAIStorage();
  client.login(process.env.DISCORD_TOKEN);
})();
