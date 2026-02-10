const puppeteer = require('puppeteer');

class ScraperService {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scrapes tweet content from a given URL.
   * Uses Nitter as a proxy to avoid X.com login walls/rate limits.
   * @param {string} url - The x.com or twitter.com URL.
   * @returns {Promise<string>} - The text content of the tweet including quotes.
   */
  async scrapeTweet(url) {
    if (!this.browser) await this.init();
    
    // Normalize URL to use a nitter instance for reliability
    let targetUrl = url.replace('x.com', 'nitter.poast.org').replace('twitter.com', 'nitter.poast.org');
    
    // Simple check to ensure valid URL
    try {
      new URL(targetUrl);
    } catch (e) {
      console.error('Invalid URL:', url);
      return `[Error: Invalid URL ${url}]`;
    }

    const page = await this.browser.newPage();
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Extract main tweet text
      const tweetText = await page.evaluate(() => {
        const content = document.querySelector('.main-tweet .tweet-content');
        return content ? content.innerText : null;
      });

      // Extract quote tweet text if present
      const quoteText = await page.evaluate(() => {
        const quote = document.querySelector('.main-tweet .quote .tweet-content');
        return quote ? `[Quote Tweet]: ${quote.innerText}` : '';
      });

      if (!tweetText) {
          // Fallback: try scraping original domain if nitter fails or returns nothing
          // This part is tricky without login, but included for completeness logic.
          return `[Could not fetch tweet content from ${url}]`;
      }

      return `Tweet: ${tweetText}\n${quoteText}`;
    } catch (error) {
      console.error('Error scraping tweet:', error);
      return `[Error fetching tweet: ${error.message}]`;
    } finally {
      await page.close();
    }
  }
}

module.exports = new ScraperService();
