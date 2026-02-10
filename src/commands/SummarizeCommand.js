const { SlashCommandBuilder } = require('discord.js');
const scraperService = require('../services/ScraperService');
const summarizerService = require('../services/SummarizerService');
const { summarize } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Summarizes the recent conversation in the channel and DMs the result.'),
  
  async execute(interaction) {
    const channel = interaction.channel;
    
    if (!channel.isTextBased()) {
      return interaction.reply({ content: 'I can only summarize text channels!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const startTime = Date.now() - TWENTY_FOUR_HOURS;
      
      // 1. Fetch messages from last 24 hours
      let allMessages = [];
      let lastId = null;

      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;

        const filtered = Array.from(fetched.values());
        allMessages.push(...filtered);
        
        lastId = filtered[filtered.length - 1].id;

        // Stop if the oldest message fetched is beyond 24h
        if (filtered[filtered.length - 1].createdTimestamp < startTime) break;
        // Safety break
        if (allMessages.length > 1000) break; 
      }

      // Filter exactly to the 24h window and reverse to chronological
      const processedMessages = allMessages
        .filter(m => m.createdTimestamp >= startTime && !m.author.bot)
        .reverse();

      if (processedMessages.length === 0) {
        return interaction.editReply('No conversation found in the last 24 hours to summarize.');
      }

      const lastMessageId = processedMessages[processedMessages.length - 1].id;

      // 2. Check Cache for existing summary
      const cachedSummary = summarizerService.getCachedSummary(channel.id, lastMessageId);
      if (cachedSummary) {
        try {
          await interaction.user.send(`**[CACHED] Conversation Summary for #${channel.name} (Last 24h)**\n\n${cachedSummary}`);
          return interaction.editReply('Sent the cached summary to your DMs!');
        } catch (dmError) {
          return interaction.editReply('I have a cached summary but could not DM you.');
        }
      }

      // 3. Initial DM to the user
      let dmMessage;
      try {
        dmMessage = await interaction.user.send(`⌛ **Generating summary for #${channel.name} (Last 24h)...**`);
        await interaction.editReply('Summary is being streamed to your DMs!');
      } catch (dmError) {
        console.error('Failed to DM user:', dmError);
        return interaction.editReply('I could not send you a DM. Please check your privacy settings.');
      }

      // 4. Generate conversation text and scrape X links
      let conversationText = '';
      for (const msg of processedMessages) {
        let content = msg.content;
        const urlRegex = /(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+)/g;
        const matches = content.match(urlRegex);

        if (matches && matches.length > 0) {
          for (const url of matches) {
            try {
              const tweetContent = await scraperService.scrapeTweet(url);
              content += `\n[Tweet Context: ${tweetContent}]`;
            } catch (err) {
              console.error(`Failed to scrape tweet ${url}:`, err);
            }
          }
        }

        conversationText += `${msg.author.username}: ${content}\n`;
      }

      // 5. Streaming setup
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 1500; 

      const summary = await summarizerService.summarize(conversationText, async (currentFullText) => {
        const now = Date.now();
        if (now - lastUpdateTime > UPDATE_INTERVAL) {
          lastUpdateTime = now;
          try {
            await dmMessage.edit(`**Conversation Summary for #${channel.name} (Last 24h)**\n\n${currentFullText} ▌`);
          } catch (e) {
            console.error('Failed to update DM:', e.message);
          }
        }
      });

      // 6. Save to Cache and final update
      summarizerService.saveSummary(channel.id, lastMessageId, summary);
      await dmMessage.edit(`**Conversation Summary for #${channel.name} (Last 24h)**\n\n${summary}`);

    } catch (error) {
      console.error('Error in summarize command:', error);
      await interaction.editReply('An error occurred while generating the summary.');
    }
  }
};
