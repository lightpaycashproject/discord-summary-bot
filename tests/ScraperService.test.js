const {
  expect,
  it,
  describe,
  beforeEach,
  afterEach,
  jest,
} = require("bun:test");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");
const scraperService = ScraperService;

describe("ScraperService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("ScraperService Integration (Real Tweets)", () => {
    beforeEach(() => {
      // Clear cache to ensure we fetch fresh for integration tests
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
    }, 15000); // Increased timeout for real network call

    it("should scrape the real Michael Saylor BTC tweet", async () => {
      const url = "https://x.com/saylor/status/2020846107685695931";
      const result = await ScraperService.scrapeTweet(url);

      expect(result).toContain("@saylor");
      expect(result).toContain("Strategy has acquired 1,142 BTC");
    }, 15000);
  });

  describe("ScraperService Unit Tests (Mocked)", () => {
    it("should extract tweet ID correctly", () => {
      const id = ScraperService.extractTweetId(
        "https://x.com/user/status/123456",
      );
      expect(id).toBe("123456");
      expect(ScraperService.extractTweetId("invalid")).toBeNull();
    });

    it("should return cached tweet if available", async () => {
      const spy = jest
        .spyOn(db, "getCachedTweet")
        .mockReturnValue({ content: "Cached Content" });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/123",
      );
      expect(result).toBe("Cached Content");
      spy.mockRestore();
    });

    it("should fetch and cache tweet if not in DB", async () => {
      const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const spySave = jest.spyOn(db, "saveTweet").mockImplementation(() => {});

      const mockTweet = {
        author: { screen_name: "test" },
        text: "New tweet",
        replying_to_status: null,
      };

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tweet: mockTweet }),
      });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/456",
      );
      expect(result).toBe("@test: New tweet");
      expect(spySave).toHaveBeenCalled();

      global.fetch = originalFetch;
      spyGet.mockRestore();
      spySave.mockRestore();
    });

    it("should unroll threads and cache result", async () => {
      const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const spySave = jest.spyOn(db, "saveTweet").mockImplementation(() => {});

      const tweet2 = {
        author: { screen_name: "u" },
        text: "T2",
        replying_to_status: "1",
      };
      const tweet1 = {
        author: { screen_name: "u" },
        text: "T1",
        replying_to_status: null,
      };

      const originalFetch = global.fetch;
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tweet: tweet2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tweet: tweet1 }),
        });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/2",
      );
      expect(result).toContain("T1");
      expect(result).toContain("T2");
      expect(spySave).toHaveBeenCalled();

      global.fetch = originalFetch;
      spyGet.mockRestore();
      spySave.mockRestore();
    });

    it("should include media images in formatting", () => {
      const tweet = {
        author: { screen_name: "user" },
        text: "Look",
        media: {
          all: [{ url: "img1" }],
        },
      };
      const output = ScraperService.formatTweet(tweet);
      expect(output).toContain("img1");
    });

    it("should include quoted tweet media", () => {
      const tweet = {
        author: { screen_name: "user" },
        text: "Look",
        quote: {
          author: { screen_name: "q" },
          text: "qt",
          media: { all: [{ url: "img2" }] },
        },
      };
      const output = ScraperService.formatTweet(tweet);
      expect(output).toContain("img2");
    });

    it("should handle partial thread failure in fetchThread", async () => {
      const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const tweet = {
        author: { screen_name: "u" },
        text: "T",
        replying_to_status: "1",
      };

      const originalFetch = global.fetch;
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tweet: tweet }),
        })
        .mockRejectedValueOnce(new Error("fail"));

      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/2",
      );
      expect(result).toContain("@u: T");

      global.fetch = originalFetch;
      spyGet.mockRestore();
    });

    it("should handle API failures gracefully", async () => {
      const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/123",
      );
      expect(result).toContain(
        "Warning: Could not fetch content for tweet 123",
      );

      global.fetch = originalFetch;
      spyGet.mockRestore();
    });

    it("should handle fatal errors in scrapeTweet", async () => {
      const originalFetchThread = ScraperService.fetchThread;
      ScraperService.fetchThread = jest
        .fn()
        .mockRejectedValue(new Error("Fatal"));

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/123",
      );
      expect(result).toContain("Error: Failed to reach the scraping service");

      ScraperService.fetchThread = originalFetchThread;
    });
  });

  describe("ScraperService Edge Cases", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      jest.restoreAllMocks();
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should return thread when API returns data without tweet property", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ code: 200, message: "OK" }), // No tweet property
      });

      const result = await scraperService.fetchThread("123456", []);

      expect(result).toEqual([]);
    });

    it("should stop fetching when thread length reaches 10", async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            tweet: {
              author: { screen_name: "user1" },
              text: "Tweet 1",
              replying_to_status: "2",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            tweet: {
              author: { screen_name: "user2" },
              text: "Tweet 2",
              replying_to_status: "3",
            },
          }),
        });

      global.fetch = mockFetch;

      // Start with 9 items already in thread
      const existingThread = Array(9)
        .fill(null)
        .map((_, i) => ({
          author: { screen_name: `user${i}` },
          text: `Tweet ${i}`,
        }));

      const result = await scraperService.fetchThread("1", existingThread);

      // Should have 10 items and NOT fetch the 11th
      expect(result.length).toBe(10);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one more fetch attempted
    });

    it("should handle tweet without replying_to_status", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          tweet: {
            author: { screen_name: "user1" },
            text: "Original tweet",
            // No replying_to_status
          },
        }),
      });

      const result = await scraperService.fetchThread("123", []);

      expect(result.length).toBe(1);
      expect(result[0].text).toBe("Original tweet");
    });

    it("should handle fetchThread errors gracefully", async () => {
      const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const originalFetchThread = ScraperService.fetchThread;
      ScraperService.fetchThread = jest
        .fn()
        .mockRejectedValue(new Error("fail"));

      const result = await ScraperService.scrapeTweet(
        "https://x.com/user/status/123",
      );

      expect(result).toContain("Error: Failed to reach the scraping service");

      ScraperService.fetchThread = originalFetchThread;
      spyGet.mockRestore();
    });
  });
});
