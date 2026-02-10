const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../services/DatabaseService");
const { admin } = require("../../config");
const { handleCommandError } = require("../utils/commandHelper");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin-only commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear-cache")
        .setDescription("Clears cache for the current channel"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("Shows bot statistics"),
    ),

  async execute(interaction) {
    if (interaction.user.id !== admin.userId) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "clear-cache") {
        db.clearChannelCache(interaction.channelId);
        await interaction.reply({
          content: `✅ Cache cleared for <#${interaction.channelId}>.`,
          ephemeral: true,
        });
      } else if (subcommand === "stats") {
        const stats = db.getDetailedStats();

        let statsMsg = "**📊 Advanced Bot Analytics**\n\n";
        statsMsg += `**Total Cost:** \`$${stats.totalCost.toFixed(6)}\`\n`;
        statsMsg += `**Total Tokens:** \`${stats.totalTokens.toLocaleString()}\`\n\n`;

        statsMsg += "**💎 Top Users (by USD cost)**\n";
        if (stats.topUsers.length > 0) {
          stats.topUsers.forEach((u, i) => {
            statsMsg += `${i + 1}. <@${u.user_id}>: \`$${u.total_cost.toFixed(6)}\` (${u.total_tokens.toLocaleString()} tokens)\n`;
          });
        } else {
          statsMsg += "_No usage data yet._\n";
        }

        statsMsg += "\n**🏰 Top Servers (by USD cost)**\n";
        if (stats.topGuilds.length > 0) {
          for (let i = 0; i < stats.topGuilds.length; i++) {
            const g = stats.topGuilds[i];
            const name =
              interaction.client.guilds.cache.get(g.guild_id)?.name ||
              `ID: ${g.guild_id}`;
            statsMsg += `${i + 1}. **${name}**: \`$${g.total_cost.toFixed(6)}\`\n`;
          }
        } else {
          statsMsg += "_No server data yet._\n";
        }

        statsMsg += "\n**🤖 Model Distribution**\n";
        if (stats.modelStats.length > 0) {
          stats.modelStats.forEach((m) => {
            const name = m.model ? m.model.split("/").pop() : "Unknown";
            statsMsg += `- **${name}**: \`$${m.total_cost.toFixed(6)}\` (${m.count} reqs)\n`;
          });
        } else {
          statsMsg += "_No model data yet._\n";
        }

        await interaction.reply({ content: statsMsg, ephemeral: true });
      }
    } catch (error) {
      await handleCommandError(
        interaction,
        error,
        `Failed to execute ${subcommand}`,
      );
    }
  },
};
