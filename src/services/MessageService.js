const db = require("./DatabaseService");
const scraperService = require("./ScraperService");

const urlRegex =
  /(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+)/g;

class MessageService {
  /**
   * Handles new messages for logging and proactive scraping.
   * @param {Object} message - The Discord message object.
   */
  async handleMessage(message) {
    if (message.author.bot) return;

    // 1. Log message to database
    try {
      db.saveMessage(
        message.id,
        message.channelId,
        message.guildId,
        message.author.id,
        message.author.username,
        message.content,
        message.createdTimestamp,
      );
    } catch (e) {
      console.error(`Failed to log message ${message.id}:`, e.message);
    }

    // 2. Pre-cache X/Twitter links
    const matches = message.content.match(urlRegex);
    if (matches) {
      for (const url of matches) {
        scraperService.scrapeTweet(url).catch((e) => {
          console.error(`Proactive scrape failed for ${url}:`, e.message);
        });
      }
    }
  }
}

module.exports = new MessageService();
