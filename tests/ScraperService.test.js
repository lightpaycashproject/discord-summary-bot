const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");

describe("ScraperService Integration (Real Tweets)", () => {
  beforeEach(() => {
    // Clear cache to ensure we fetch fresh
    db.db.query("DELETE FROM scraped_data").run();
  });

  it("should scrape the real derteil00 tweet with quote accurately", async () => {
    const url = "https://x.com/derteil00/status/2020857102021914803";
    const result = await ScraperService.scrapeTweet(url);
    
    expect(result).toContain("@derteil00");
    expect(result).toContain("I waited for them to tweet");
    expect(result).toContain("[Quoting @saylor]");
    expect(result).toContain("Strategy has acquired 1,142 BTC");
    
    // Check if it was cached
    const cached = db.getCachedTweet(url);
    expect(cached).not.toBeNull();
    expect(cached.content).toBe(result);
  }, 10000); // 10s timeout for real API call

  it("should scrape the real Michael Saylor BTC tweet", async () => {
    const url = "https://x.com/saylor/status/2020846107685695931";
    const result = await ScraperService.scrapeTweet(url);
    
    expect(result).toContain("@saylor");
    expect(result).toContain("Strategy has acquired 1,142 BTC");
  }, 10000);
});

describe("ScraperService Unit Tests", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should extract tweet ID correctly", () => {
    const id = ScraperService.extractTweetId("https://x.com/user/status/123456");
    expect(id).toBe("123456");
  });

  it("should handle invalid URLs", async () => {
    const result = await ScraperService.scrapeTweet("https://google.com");
    expect(result).toContain("Could not extract tweet ID");
  });

  it("should format tweets with quotes correctly (Unit)", () => {
    const tweet = {
      author: { screen_name: "userA" },
      text: "textA",
      quote: { author: { screen_name: "userB" }, text: "textB" },
    };
    const output = ScraperService.formatTweet(tweet);
    expect(output).toContain("@userA: textA");
    expect(output).toContain("[Quoting @userB]: textB");
  });
});
