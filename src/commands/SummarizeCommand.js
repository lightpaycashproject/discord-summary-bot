const { SlashCommandBuilder } = require("discord.js");
const scraperService = require("../services/ScraperService");
const summarizerService = require("../services/SummarizerService");

module.exports = {
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

      let allMessages = [];
      let lastId = null;

      // 1. Fetch messages from last 24 hours (Infinite loop safety: max 10,000 messages)
      while (true) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const fetched = await channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) break;

        const filtered = Array.from(fetched.values());
        allMessages.push(...filtered);

        lastId = filtered[filtered.length - 1].id;

        // Stop if we've gone past the 24-hour mark
        if (filtered[filtered.length - 1].createdTimestamp < startTime) break;
        // Safety break for extremely active channels
        if (allMessages.length > 10000) break;
      }

      const processedMessages = allMessages
        .filter((m) => m.createdTimestamp >= startTime && !m.author.bot)
        .reverse();

      if (processedMessages.length === 0) {
        return interaction.editReply(
          "No conversation found in the last 24 hours to summarize.",
        );
      }

      const lastMessageId = processedMessages[processedMessages.length - 1].id;

      // 2. Check Cache
      const cachedSummary = summarizerService.getCachedSummary(
        channel.id,
        lastMessageId,
      );
      if (cachedSummary) {
        try {
          await interaction.user.send(
            `**[CACHED] Conversation Summary for #${channel.name} (Last 24h)**\n\n${cachedSummary}`,
          );
          return interaction.editReply("Sent the cached summary to your DMs!");
        } catch (dmError) {
          console.error("Failed to DM cached summary:", dmError.message);
          return interaction.editReply(
            "I have a cached summary but could not DM you.",
          );
        }
      }

      // 3. Pre-Scrape X Links in Parallel for Performance
      const urlRegex =
        /(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+)/g;
      const uniqueUrls = new Set();
      processedMessages.forEach((m) => {
        const matches = m.content.match(urlRegex);
        if (matches) matches.forEach((url) => uniqueUrls.add(url));
      });

      const urlContextMap = new Map();
      if (uniqueUrls.size > 0) {
        const urlArray = Array.from(uniqueUrls);
        const BATCH_SIZE = 5;

        for (let i = 0; i < urlArray.length; i += BATCH_SIZE) {
          const batch = urlArray.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (url) => {
              try {
                const content = await scraperService.scrapeTweet(url);
                return { url, content };
              } catch (e) {
                console.error(`Failed to scrape ${url}:`, e.message);
                return { url, content: null };
              }
            }),
          );
          results.forEach((res) => {
            if (res.content) urlContextMap.set(res.url, res.content);
          });
        }
      }

      // 4. Initial DM
      let dmMessage;
      try {
        dmMessage = await interaction.user.send(
          `⌛ **Generating summary for #${channel.name} (Last 24h)...**`,
        );
        await interaction.editReply("Summary is being streamed to your DMs!");
      } catch (dmError) {
        console.error("Failed to send initial DM:", dmError.message);
        return interaction.editReply(
          "I could not send you a DM. Please check your privacy settings.",
        );
      }

      // 5. Build conversation text
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
        conversationText += `${msg.author.username}: ${content}\n`;
      }

      // 6. Summarize with Streaming
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 1500;

      const summary = await summarizerService.summarize(
        conversationText,
        async (currentFullText) => {
          const now = Date.now();
          if (now - lastUpdateTime > UPDATE_INTERVAL) {
            lastUpdateTime = now;
            try {
              await dmMessage.edit(
                `**Conversation Summary for #${channel.name} (Last 24h)**\n\n${currentFullText} ▌`,
              );
            } catch (e) {
              console.error("Failed to update DM stream:", e.message);
            }
          }
        },
      );

      summarizerService.saveSummary(
        channel.id,
        lastMessageId,
        summary,
        interaction.guildId,
        interaction.user.id,
        summary.split(/\s+/).length, // Estimated tokens
      );
      await dmMessage.edit(
        `**Conversation Summary for #${channel.name} (Last 24h)**\n\n${summary}`,
      );
    } catch (error) {
      console.error("Error in summarize command:", error.message);
      await interaction.editReply(
        "An error occurred while generating the summary.",
      );
    }
  },
};
