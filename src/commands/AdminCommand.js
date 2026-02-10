const { SlashCommandBuilder } = require("discord.js");
const db = require("../services/DatabaseService");
const { admin } = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin-only commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear-cache")
        .setDescription(
          "Clears the summary and X scraping cache for the current channel",
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("Shows bot statistics"),
    ),

  async execute(interaction) {
    // Check if user is admin
    if (interaction.user.id !== admin.userId) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "clear-cache") {
      try {
        // We'll need a method in DatabaseService to clear specific channel cache
        // For now, let's just implement the logic or call a DB method.
        // I'll add 'clearChannelCache' to DatabaseService.
        db.clearChannelCache(interaction.channelId);
        await interaction.reply({
          content: `✅ Cache cleared for channel <#${interaction.channelId}>.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error("Admin clear-cache error:", error);
        await interaction.reply({
          content: "Failed to clear cache.",
          ephemeral: true,
        });
      }
    } else if (subcommand === "stats") {
      const stats = db.getStats();
      await interaction.reply({
        content: `**Bot Stats**\n- Cached Tweets: ${stats.tweets}\n- Cached Summaries: ${stats.summaries}`,
        ephemeral: true,
      });
    }
  },
};
