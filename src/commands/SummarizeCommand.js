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
      const limit = summarize.limit || 50;
      const messages = await channel.messages.fetch({ limit });
      
      let conversationText = '';
      const processedMessages = Array.from(messages.values()).reverse();

      for (const msg of processedMessages) {
        if (msg.author.bot) continue;

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

      if (!conversationText) {
        return interaction.editReply('No conversation found to summarize.');
      }

      // Initial DM to the user
      let dmMessage;
      try {
        dmMessage = await interaction.user.send(`⌛ **Generating summary for #${channel.name}...**`);
        await interaction.editReply('Summary is being streamed to your DMs!');
      } catch (dmError) {
        console.error('Failed to DM user:', dmError);
        return interaction.editReply('I could not send you a DM. Please check your privacy settings.');
      }

      // Streaming setup
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 1500; // 1.5 seconds to respect rate limits

      const summary = await summarizerService.summarize(conversationText, async (currentFullText) => {
        const now = Date.now();
        if (now - lastUpdateTime > UPDATE_INTERVAL) {
          lastUpdateTime = now;
          try {
            await dmMessage.edit(`**Conversation Summary for #${channel.name}**\n\n${currentFullText} ▌`);
          } catch (e) {
            console.error('Failed to update DM:', e.message);
          }
        }
      });

      // Final update
      await dmMessage.edit(`**Conversation Summary for #${channel.name}**\n\n${summary}`);

    } catch (error) {
      console.error('Error in summarize command:', error);
      await interaction.editReply('An error occurred while generating the summary.');
    }
  }
};
