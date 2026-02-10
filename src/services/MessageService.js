const db = require("./DatabaseService");
const scraperService = require("./ScraperService");

class MessageService {
  /**
   * Handles new messages for logging and proactive scraping.
   * @param {Object} message - The Discord message object.
   */
  async handleMessage(message) {
    if (message.author.bot) return;

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

      // Periodically prune old messages
      if (Math.random() < 0.1) {
        db.pruneMessages(30);
      }
    } catch (e) {
      console.error(`Failed to log message ${message.id}:`, e.message);
    }

    // Proactive scraping using centralized logic
    scraperService.scrapeAllFromText(message.content).catch((e) => {
      console.error(`Proactive scrape failed:`, e.message);
    });
  }

  /**
   * Formats various message types (DB row or Discord.js object) into a standard format.
   * @param {Object} m
   * @returns {Object}
   */
  formatStandard(m) {
    return {
      id: m.id,
      username: m.username || m.author?.username,
      content: m.content,
      timestamp: m.timestamp || m.createdTimestamp,
    };
  }

  /**
   * Sends a potentially long message to a user via DM, chunking if necessary.
   * @param {Object} user - Discord user object
   * @param {string} text - Content to send
   * @param {string} prefix - Optional header/prefix for the first chunk
   */
  async sendDMChunks(user, text, prefix = "") {
    const chunks = this.chunkString(text);
    await user.send(`${prefix}${chunks[0]}`);
    for (let i = 1; i < chunks.length; i++) {
      await user.send(chunks[i]);
    }
  }

  /**
   * Splits a long string into chunks that fit within Discord's 2000 character limit.
   * @param {string} text
   * @param {number} maxLength
   * @returns {string[]}
   */
  chunkString(text, maxLength = 1900) {
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
}

module.exports = new MessageService();
