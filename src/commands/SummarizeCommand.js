const { SlashCommandBuilder } = require("discord.js");
const scraperService = require("../services/ScraperService");
const summarizerService = require("../services/SummarizerService");
const db = require("../services/DatabaseService");
const messageService = require("../services/MessageService");
const { handleCommandError } = require("../utils/commandHelper");

/**
 * Helper class for managing stream updates to the channel.
 */
class StreamUpdateHelper {
  constructor(statusMessage, channelName, updateInterval = 1500) {
    this.statusMessage = statusMessage;
    this.channelName = channelName;
    this.lastUpdateTime = Date.now();
    this.updateInterval = updateInterval;
  }

  async maybeUpdate(currentFullText) {
    const now = Date.now();
    if (now - this.lastUpdateTime > this.updateInterval) {
      this.lastUpdateTime = now;
      await this.updateStatus(currentFullText);
    }
  }

  async updateStatus(currentFullText) {
    try {
      let displayBody = currentFullText;
      if (displayBody.length > 1800) {
        displayBody = `...${displayBody.substring(displayBody.length - 1750)}`;
      }
      await this.statusMessage.edit(
        `**Conversation Summary for #${this.channelName} (Last 24h)**\n\n${displayBody} ▌`,
      );
    } catch (e) {
      console.error("Failed to update channel stream:", e.message);
    }
  }
}

module.exports = {
  StreamUpdateHelper,

  data: new SlashCommandBuilder()
    .setName("summarize")
    .setDescription(
      "Summarizes the recent conversation in the channel and DMs the result.",
    ),

  async execute(interaction) {
    const channel = interaction.channel;
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "I can only summarize text channels!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const startTime = Date.now() - TWENTY_FOUR_HOURS;

      // 1. Fetch Local or API
      let messages = db.getMessages(channel.id, startTime);
      let usedLocal = messages.length > 0;

      if (!usedLocal) {
        let all = [];
        let lastId = null;
        while (true) {
          const fetched = await channel.messages.fetch({
            limit: 100,
            before: lastId,
          });
          if (fetched.size === 0) break;
          const list = Array.from(fetched.values());
          all.push(...list);
          lastId = list[list.length - 1].id;
          if (
            list[list.length - 1].createdTimestamp < startTime ||
            all.length > 10000
          )
            break;
        }
        messages = all
          .filter((m) => m.createdTimestamp >= startTime && !m.author.bot)
          .reverse();
      }

      const processedMessages = messages.map((m) =>
        messageService.formatStandard(m),
      );

      if (processedMessages.length === 0) {
        return interaction.editReply(
          "No conversation found in the last 24 hours to summarize.",
        );
      }

      const lastMessageId = processedMessages[processedMessages.length - 1].id;

      // 2. Check Cache
      const cached =
        summarizerService.getCachedSummary(channel.id, lastMessageId) ||
        db.getRecentSummary(channel.id, 5 * 60 * 1000);

      if (cached) {
        try {
          await messageService.sendDMChunks(
            interaction.user,
            cached,
            `**[FRESH] Conversation Summary for #${channel.name} (Last 24h)**\n\n`,
          );
          return interaction.editReply("Sent the summary to your DMs!");
        } catch {
          return interaction.editReply(
            "I have a cached summary but could not DM you. Check privacy settings.",
          );
        }
      }

      // 3. Pre-Scrape
      const fullText = processedMessages.map((m) => m.content).join(" ");
      const { contextMap, failures } =
        await scraperService.scrapeAllFromText(fullText);

      // 4. Status Message
      let statusMsg = `⌛ **Generating summary for #${channel.name} (Last 24h)...**`;
      if (usedLocal) statusMsg += "\n⚡ *Using local message log.*";
      if (failures > 0)
        statusMsg += `\n⚠️ *Note: ${failures} Twitter link(s) could not be fully scraped.*`;

      const dmStatusMsg = await interaction.user.send(statusMsg);
      await interaction.editReply(
        "I'm generating your summary! It will be streamed to your DMs.",
      );

      // 5. Summarize
      let conversationText = "";
      processedMessages.forEach((msg) => {
        let content = msg.content;
        const matches = content.match(scraperService.urlRegex);
        if (matches) {
          matches.forEach((url) => {
            const context = contextMap.get(url);
            if (context) content += `\n[Tweet Context: ${context}]`;
          });
        }
        conversationText += `${msg.username}: ${content}\n`;
      });

      const streamHelper = new StreamUpdateHelper(dmStatusMsg, channel.name);
      const result = await summarizerService.summarize(
        conversationText,
        async (t) => await streamHelper.maybeUpdate(t),
      );

      summarizerService.saveSummary(
        channel.id,
        lastMessageId,
        result.summary,
        interaction.guildId,
        interaction.user.id,
        result.usage?.total_tokens || result.summary.split(/\s+/).length,
        result.usage?.total_cost || 0,
        result.model,
      );

      await messageService.sendDMChunks(
        interaction.user,
        result.summary,
        `**Conversation Summary for #${channel.name} (Last 24h)**\n\n`,
      );
      await dmStatusMsg.delete().catch(() => {});
    } catch (error) {
      await handleCommandError(interaction, error);
    }
  },
};
