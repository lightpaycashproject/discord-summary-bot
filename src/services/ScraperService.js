const axios = require('axios');
const db = require('./DatabaseService');

class ScraperService {
  /**
   * Scrapes tweet content from a given URL using FixTweet (fxtwitter) API.
   * Handles threads by unrolling them and includes quoted tweet text.
   * @param {string} url - The x.com or twitter.com URL.
   * @returns {Promise<string>} - The text content of the tweet including quotes and thread.
   */
  async scrapeTweet(url) {
    // Check Cache
    const cached = db.getCachedTweet(url);
    if (cached) return cached.content;

    const tweetId = this.extractTweetId(url);
    if (!tweetId) {
      return `[Error: Could not extract tweet ID from ${url}]`;
    }

    try {
      const thread = await this.fetchThread(tweetId);
      if (!thread || thread.length === 0) {
        return `[Could not fetch tweet content for ID ${tweetId}]`;
      }

      const formattedContent = thread.map(t => this.formatTweet(t)).join('\n---\n');
      
      // Save to Cache
      db.saveTweet(url, formattedContent);

      return formattedContent;
    } catch (error) {
      console.error('Error scraping tweet:', error.message);
      return `[Error fetching tweet: ${error.message}]`;
    }
  }

  /**
   * Recursively fetches a thread starting from a tweet ID.
   * @param {string} tweetId 
   * @param {Array} thread 
   * @returns {Promise<Array>}
   */
  async fetchThread(tweetId, thread = []) {
    try {
      const response = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
        headers: { 'User-Agent': 'DiscordSummaryBot/1.0' }
      });

      if (response.data && response.data.tweet) {
        const tweet = response.data.tweet;
        thread.unshift(tweet); // Add to the beginning of the thread array

        // If this tweet is a reply, fetch the parent
        if (tweet.replying_to_status) {
          // Limit thread depth to avoid infinite loops or massive payloads
          if (thread.length < 10) {
            return await this.fetchThread(tweet.replying_to_status, thread);
          }
        }
      }
      return thread;
    } catch (error) {
      // If we hit an error fetching a parent, just return what we have
      return thread;
    }
  }

  /**
   * Formats a tweet object into a readable string.
   * @param {Object} tweet 
   * @returns {string}
   */
  formatTweet(tweet) {
    let output = `@${tweet.author.screen_name}: ${tweet.text}`;
    
    if (tweet.quote) {
      output += `\n[Quoting @${tweet.quote.author.screen_name}]: ${tweet.quote.text}`;
    }
    
    return output;
  }

  /**
   * Extracts the tweet ID from a URL.
   * @param {string} url 
   * @returns {string|null}
   */
  extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  }
}

module.exports = new ScraperService();
