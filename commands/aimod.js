const { SlashCommandBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const {
  isOwner,
  HOURLY_MAX,
  banUser,
  unbanUser,
  getBan,
  isBanned,
  setUserLimit,
  removeUserLimit,
  getUserLimit,
  getAllRestrictions,
} = require('../utils/aiEngine');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ownerOnly(interaction) {
  if (!isOwner(interaction.user.id)) {
    interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
    return false;
  }
  return true;
}

function ts(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────
async function handleBan(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given.';

  if (isOwner(target.id)) {
    return interaction.reply({ content: "You can't ban yourself from AI.", ephemeral: true });
  }

  banUser(target.id, reason, interaction.user.id);

  await interaction.reply({
    content: `🚫 **${target.username}** (\`${target.id}\`) has been banned from AI commands.\n**Reason:** ${reason}`,
    ephemeral: true,
  });
}

async function handleUnban(interaction) {
  const target = interaction.options.getUser('user');

  if (!isBanned(target.id)) {
    return interaction.reply({ content: `**${target.username}** isn't currently banned from AI.`, ephemeral: true });
  }

  unbanUser(target.id);

  await interaction.reply({
    content: `✅ **${target.username}** (\`${target.id}\`) has been unbanned from AI commands.`,
    ephemeral: true,
  });
}

async function handleLimit(interaction) {
  const target = interaction.options.getUser('user');
  const limit  = interaction.options.getInteger('limit');

  if (isOwner(target.id)) {
    return interaction.reply({ content: "The owner has no rate limits — no need to set one.", ephemeral: true });
  }

  setUserLimit(target.id, limit);

  const desc = limit === 0
    ? `🔒 **${target.username}** (\`${target.id}\`) now has **no access** to AI commands (limit set to 0).`
    : `⚙️ **${target.username}** (\`${target.id}\`) AI limit set to **${limit} requests/hour**.`;

  await interaction.reply({ content: desc, ephemeral: true });
}

async function handleResetLimit(interaction) {
  const target = interaction.options.getUser('user');

  if (getUserLimit(target.id) === null) {
    return interaction.reply({
      content: `**${target.username}** already uses the default limit (${HOURLY_MAX}/hour).`,
      ephemeral: true,
    });
  }

  removeUserLimit(target.id);

  await interaction.reply({
    content: `✅ **${target.username}** (\`${target.id}\`) reset to default limit (**${HOURLY_MAX} requests/hour**).`,
    ephemeral: true,
  });
}

async function handleStatus(interaction) {
  const target = interaction.options.getUser('user');

  const ban         = getBan(target.id);
  const customLimit = getUserLimit(target.id);
  const lines       = [`**AI status for ${target.username}** (\`${target.id}\`)`];

  if (ban) {
    lines.push(`🚫 **Banned** — ${ban.reason}`);
    lines.push(`  Banned ${ts(ban.bannedAt)}`);
  } else {
    lines.push(`✅ Not banned`);
  }

  if (customLimit !== null) {
    lines.push(customLimit === 0
      ? `🔒 **Custom limit:** no access (0/hour)`
      : `⚙️ **Custom limit:** ${customLimit}/hour`);
  } else {
    lines.push(`⚙️ **Limit:** default (${HOURLY_MAX}/hour)`);
  }

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleList(interaction) {
  const all = getAllRestrictions();

  if (all.length === 0) {
    return interaction.reply({ content: 'No users are currently banned or have custom limits.', ephemeral: true });
  }

  const lines = ['**AI restrictions**', ''];

  for (const { userId, ban, customLimit } of all) {
    const parts = [];
    if (ban)               parts.push(`🚫 banned (${ban.reason})`);
    if (customLimit !== null) parts.push(customLimit === 0 ? '🔒 no access' : `⚙️ ${customLimit}/hour`);
    lines.push(`<@${userId}> (\`${userId}\`) — ${parts.join(', ')}`);
  }

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

// ─── Command definition ───────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimod')
    .setDescription('(Owner only) Manage AI access for users')
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a user from all AI commands')
        .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('Reason for the ban').setRequired(false).setMaxLength(300),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unban')
        .setDescription('Unban a user from AI commands')
        .addUserOption((opt) => opt.setName('user').setDescription('User to unban').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('limit')
        .setDescription('Set a custom hourly AI request limit for a user (0 = no access)')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Requests allowed per hour (0 = blocked, default is ' + HOURLY_MAX + ')')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('resetlimit')
        .setDescription('Remove a custom limit override and restore the default')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription("Check a user's current AI ban and limit status")
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all users with active AI bans or custom limits'),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    if (!ownerOnly(interaction)) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'ban')        return handleBan(interaction);
    if (sub === 'unban')      return handleUnban(interaction);
    if (sub === 'limit')      return handleLimit(interaction);
    if (sub === 'resetlimit') return handleResetLimit(interaction);
    if (sub === 'status')     return handleStatus(interaction);
    if (sub === 'list')       return handleList(interaction);
  },
};
