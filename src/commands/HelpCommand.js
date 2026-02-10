const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows available commands and how to use the bot"),

  async execute(interaction) {
    const helpEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("🤖 Discord Summary Bot Help")
      .setDescription(
        "I summarize channel conversations and unroll X/Twitter threads for you.",
      )
      .addFields(
        {
          name: "📝 `/summarize`",
          value:
            "Fetches the last 24 hours of messages in the current channel, unrolls any X.com/Twitter threads, and sends a structured summary to your **DMs**.",
        },
        {
          name: "⚙️ `/admin stats` (Admin Only)",
          value:
            "Shows bot usage statistics, token consumption, and leaderboards.",
        },
        {
          name: "🧹 `/admin clear-cache` (Admin Only)",
          value:
            "Clears the summary and X scraping cache for the current channel.",
        },
      )
      .addFields({
        name: "🔒 Privacy Note",
        value:
          "Summaries are always sent to your DMs to keep the channel clean and maintain privacy.",
      })
      .setFooter({
        text: "Built with Bun & OpenRouter",
      });

    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  },
};
