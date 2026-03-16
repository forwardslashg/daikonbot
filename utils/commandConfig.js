const { ApplicationIntegrationType, InteractionContextType } = require('discord.js');

/**
 * Shared integration/context settings applied to every command.
 *
 * integrationTypes:
 *   - UserInstall  (1) → the user installs the app themselves
 *   - GuildInstall (0) → optionally also works in servers the bot is added to
 *
 * contexts:
 *   - Guild          (0) → inside a server
 *   - BotDM          (1) → bot DMs
 *   - PrivateChannel (2) → group DMs / other DMs
 */
const userInstallConfig = {
  integrationTypes: [
    ApplicationIntegrationType.UserInstall,
    ApplicationIntegrationType.GuildInstall,
  ],
  contexts: [
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ],
};

module.exports = { userInstallConfig };
