const { SlashCommandBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const { clearSession } = require('../utils/aiEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('new')
    .setDescription('Start a fresh AI conversation — clears your current session')
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    clearSession(interaction.user.id);
    await interaction.reply({
      content: 'Started a new conversation. Use `/ai` to chat.',
      ephemeral: true,
    });
  },
};
