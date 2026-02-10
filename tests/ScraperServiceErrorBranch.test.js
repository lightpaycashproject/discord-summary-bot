const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");

describe("ScraperService Error Branch", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should handle fetchThread errors gracefully", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    const originalFetchThread = ScraperService.fetchThread;
    ScraperService.fetchThread = jest.fn().mockRejectedValue(new Error("fail"));

    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );

    expect(result).toContain("Error fetching tweet");

    ScraperService.fetchThread = originalFetchThread;
    spyGet.mockRestore();
  });
});
