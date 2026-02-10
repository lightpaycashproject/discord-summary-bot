const { SlashCommandBuilder } = require('discord.js');
const scraperService = require('../services/ScraperService');
const summarizerService = require('../services/SummarizerService');
const { summarize } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Summarizes the recent conversation in the channel and DMs the result.'),
  
  async execute(interaction) {
    // Determine channel to fetch from (default to current or specified)
    const channel = interaction.channel;
    
    if (!channel.isText()) {
      return interaction.reply({ content: 'I can only summarize text channels!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Fetch messages
      const limit = summarize.limit || 50;
      const messages = await channel.messages.fetch({ limit });
      
      let conversationText = '';
      const processedMessages = Array.from(messages.values()).reverse();

      for (const msg of processedMessages) {
        if (msg.author.bot) continue; // Skip bot messages

        let content = msg.content;
        
        // Detect X.com / Twitter links
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

      // Generate Summary
      const summary = await summarizerService.summarize(conversationText);

      // Send via DM
      try {
        await interaction.user.send(`**Conversation Summary for #${channel.name}**\n\n${summary}`);
        await interaction.editReply('Summary sent to your DMs!');
      } catch (dmError) {
        console.error('Failed to DM user:', dmError);
        await interaction.editReply('I could not send you a DM. Please check your privacy settings.');
      }

    } catch (error) {
      console.error('Error in summarize command:', error);
      await interaction.editReply('An error occurred while generating the summary.');
    }
  }
};
