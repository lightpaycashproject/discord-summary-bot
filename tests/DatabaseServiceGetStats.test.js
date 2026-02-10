const { expect, it, describe } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService getStats", () => {
  it("should return tweet and summary counts", () => {
    dbService.saveTweet("https://x.com/test_stats", "Tweet Content");
    dbService.saveSummary("chan_stats", "msg_stats", "Summary Test");

    const stats = dbService.getStats();
    expect(stats).toHaveProperty("tweets");
    expect(stats).toHaveProperty("summaries");
    expect(stats.tweets).toBeGreaterThan(0);
    expect(stats.summaries).toBeGreaterThan(0);
  });
});
