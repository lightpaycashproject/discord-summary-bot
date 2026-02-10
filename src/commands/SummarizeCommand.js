const { SlashCommandBuilder } = require("discord.js");
const scraperService = require("../services/ScraperService");
const summarizerService = require("../services/SummarizerService");
const db = require("../services/DatabaseService");

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

  /**
   * Attempts to update the message if the update interval has passed.
   * @param {string} currentFullText - The current summary text
   * @returns {Promise<void>}
   */
  async maybeUpdate(currentFullText) {
    const now = Date.now();
    if (now - this.lastUpdateTime > this.updateInterval) {
      this.lastUpdateTime = now;
      await this.updateStatus(currentFullText);
    }
  }

  /**
   * Updates the channel message with the current text.
   * @param {string} currentFullText - The current summary text
   * @returns {Promise<void>}
   */
  async updateStatus(currentFullText) {
    try {
      // Discord limit is 2000 characters. If streaming, we just show the tail.
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

/**
 * Splits a long string into chunks that fit within Discord's 2000 character limit.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string[]}
 */
function chunkString(text, maxLength = 1900) {
  const chunks = [];
  let current = text;
  while (current.length > 0) {
    if (current.length <= maxLength) {
      chunks.push(current);
      break;
    }
    let splitIdx = current.lastIndexOf("\n", maxLength);
    if (splitIdx === -1) splitIdx = maxLength;
    chunks.push(current.substring(0, splitIdx));
    current = current.substring(splitIdx).trim();
  }
  return chunks;
}

module.exports = {
  StreamUpdateHelper,
  chunkString,

  data: new SlashCommandBuilder()
    .setName("summarize")
    .setDescription(
      "Summarizes the recent conversation in the channel and posts the result here.",
    ),

  async execute(interaction) {
    const channel = interaction.channel;

    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "I can only summarize text channels!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const startTime = Date.now() - TWENTY_FOUR_HOURS;

      // 1. Try to fetch from Local Database first
      let processedMessages = db.getMessages(channel.id, startTime);
      let usedLocal = processedMessages.length > 0;

      // 2. If local is empty, fallback to Discord API
      if (processedMessages.length === 0) {
        let allMessages = [];
        let lastId = null;

        while (true) {
          const fetchOptions = { limit: 100 };
          if (lastId) fetchOptions.before = lastId;

          const fetched = await channel.messages.fetch(fetchOptions);
          if (fetched.size === 0) break;

          const filtered = Array.from(fetched.values());
          allMessages.push(...filtered);

          lastId = filtered[filtered.length - 1].id;
          if (filtered[filtered.length - 1].createdTimestamp < startTime) break;
          if (allMessages.length > 10000) break;
        }

        processedMessages = allMessages
          .filter((m) => m.createdTimestamp >= startTime && !m.author.bot)
          .map((m) => ({
            id: m.id,
            username: m.author.username,
            content: m.content,
            createdTimestamp: m.createdTimestamp,
          }))
          .reverse();
      } else {
        processedMessages = processedMessages.map((m) => ({
          id: m.id,
          username: m.username,
          content: m.content,
          createdTimestamp: m.timestamp,
        }));
      }

      if (processedMessages.length === 0) {
        return interaction.editReply(
          "No conversation found in the last 24 hours to summarize.",
        );
      }

      const lastMessageId = processedMessages[processedMessages.length - 1].id;

      // 3. Check Cache
      const cachedSummary =
        summarizerService.getCachedSummary(channel.id, lastMessageId) ||
        db.getRecentSummary(channel.id, 5 * 60 * 1000);

      if (cachedSummary) {
        const chunks = chunkString(cachedSummary);
        await interaction.editReply(
          `**[FRESH] Conversation Summary for #${channel.name} (Last 24h)**\n\n${chunks[0]}`,
        );
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
        return;
      }

      // 4. Pre-Scrape X Links
      const urlRegex =
        /(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+)/g;
      const uniqueUrls = new Set();
      processedMessages.forEach((m) => {
        const matches = m.content.match(urlRegex);
        if (matches) matches.forEach((url) => uniqueUrls.add(url));
      });

      const urlContextMap = new Map();
      let scrapeFailures = 0;
      if (uniqueUrls.size > 0) {
        const urlArray = Array.from(uniqueUrls);
        for (let i = 0; i < urlArray.length; i += 5) {
          const batch = urlArray.slice(i, i + 5);
          const results = await Promise.all(
            batch.map(async (url) => {
              try {
                const content = await scraperService.scrapeTweet(url);
                if (content.includes("[Error") || content.includes("[Warning"))
                  scrapeFailures++;
                return { url, content };
              } catch (e) {
                scrapeFailures++;
                return { url, content: null };
              }
            }),
          );
          results.forEach((res) => {
            if (res.content) urlContextMap.set(res.url, res.content);
          });
        }
      }

      // 5. Initial Status
      let statusMsg = `⌛ **Generating summary for #${channel.name} (Last 24h)...**`;
      if (usedLocal) statusMsg += "\n⚡ *Using local message log.*";
      if (scrapeFailures > 0)
        statusMsg += `\n⚠️ *Note: ${scrapeFailures} Twitter link(s) could not be fully scraped.*`;

      const statusMessage = await interaction.editReply(statusMsg);

      // 6. Build Text
      let conversationText = "";
      for (const msg of processedMessages) {
        let content = msg.content;
        const matches = content.match(urlRegex);
        if (matches) {
          matches.forEach((url) => {
            const context = urlContextMap.get(url);
            if (context) content += `\n[Tweet Context: ${context}]`;
          });
        }
        conversationText += `${msg.username}: ${content}\n`;
      }

      // 7. Summarize with Streaming
      const streamHelper = new StreamUpdateHelper(statusMessage, channel.name);
      const result = await summarizerService.summarize(
        conversationText,
        async (t) => await streamHelper.maybeUpdate(t),
      );

      const { summary, usage, model } = result;
      summarizerService.saveSummary(
        channel.id,
        lastMessageId,
        summary,
        interaction.guildId,
        interaction.user.id,
        usage?.total_tokens || summary.split(/\s+/).length,
        usage?.total_cost || 0,
        model,
      );

      // 8. Final Delivery
      const chunks = chunkString(summary);
      await statusMessage.edit(
        `**Conversation Summary for #${channel.name} (Last 24h)**\n\n${chunks[0]}`,
      );
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } catch (error) {
      console.error("Error in summarize command:", error.message);
      await interaction.editReply(
        "An error occurred while generating the summary.",
      );
    }
  },
};
