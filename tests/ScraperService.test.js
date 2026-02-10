const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");
const { silenceConsole } = require("./helpers");

describe("ScraperService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  describe("ScraperService Integration (Real Tweets)", () => {
    beforeEach(() => {
      db.db.query("DELETE FROM scraped_data").run();
    });

    it("should scrape the real derteil00 tweet with quote accurately", async () => {
      const url = "https://x.com/derteil00/status/2020857102021914803";
      const result = await ScraperService.scrapeTweet(url);

      expect(result).toContain("@derteil00");
      expect(result).toContain("I waited for them to tweet");
      expect(result).toContain("[Quoting @saylor]");
      expect(result).toContain("Strategy has acquired 1,142 BTC");

      const cached = db.getCachedTweet(url);
      expect(cached).not.toBeNull();
      expect(cached.content).toBe(result);
    }, 15000);

    it("should scrape the real Michael Saylor BTC tweet", async () => {
      const url = "https://x.com/saylor/status/2020846107685695931";
      const result = await ScraperService.scrapeTweet(url);
      expect(result).toContain("@saylor");
      expect(result).toContain("Strategy has acquired 1,142 BTC");
    }, 15000);
  });

  describe("ScraperService Unit Tests (Mocked)", () => {
    it("should extract tweet ID correctly", () => {
      const id = ScraperService.extractTweetId("https://x.com/user/status/123");
      expect(id).toBe("123");
      expect(ScraperService.extractTweetId("invalid")).toBeNull();
    });

    it("should return cached tweet if available", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue({ content: "Cached" });
      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/1",
      );
      expect(result).toBe("Cached");
    });

    it("should fetch and cache tweet if not in DB", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const spySave = jest.spyOn(db, "saveTweet").mockImplementation(() => {});

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tweet: { author: { screen_name: "t" }, text: "hi" },
          }),
      });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/456",
      );
      expect(result).toBe("@t: hi");
      expect(spySave).toHaveBeenCalled();
      global.fetch = originalFetch;
    });

    it("should unroll threads and cache result", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const spySave = jest.spyOn(db, "saveTweet").mockImplementation(() => {});

      const originalFetch = global.fetch;
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              tweet: {
                author: { screen_name: "u" },
                text: "T2",
                replying_to_status: "1",
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              tweet: { author: { screen_name: "u" }, text: "T1" },
            }),
        });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/2",
      );
      expect(result).toContain("T1");
      expect(result).toContain("T2");
      expect(spySave).toHaveBeenCalled();
      global.fetch = originalFetch;
    });

    it("should include media images in formatting", () => {
      const tweet = {
        author: { screen_name: "u" },
        text: "L",
        media: { all: [{ url: "img" }] },
      };
      expect(ScraperService.formatTweet(tweet)).toContain("img");
    });

    it("should include quoted tweet media", () => {
      const tweet = {
        author: { screen_name: "u" },
        text: "L",
        quote: {
          author: { screen_name: "q" },
          text: "qt",
          media: { all: [{ url: "img2" }] },
        },
      };
      expect(ScraperService.formatTweet(tweet)).toContain("img2");
    });

    it("should handle partial thread failure in fetchThread", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const originalFetch = global.fetch;
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              tweet: {
                author: { screen_name: "u" },
                text: "T",
                replying_to_status: "1",
              },
            }),
        })
        .mockRejectedValueOnce(new Error("fail"));

      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/2",
      );
      expect(result).toContain("@u: T");
      global.fetch = originalFetch;
    });

    it("should handle API failures gracefully", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/123",
      );
      expect(result).toContain("Warning: Could not fetch content");
      global.fetch = originalFetch;
    });

    it("should handle fatal errors in scrapeTweet", async () => {
      const originalFetchThread = ScraperService.fetchThread;
      ScraperService.fetchThread = jest
        .fn()
        .mockRejectedValue(new Error("Fatal"));
      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/123",
      );
      expect(result).toContain("Error: Failed to reach the scraping service");
      ScraperService.fetchThread = originalFetchThread;
    });

    it("should return error for invalid URL in scrapeTweet", async () => {
      const result = await ScraperService.scrapeTweet("invalid");
      expect(result).toContain("Could not extract tweet ID");
    });
  });

  describe("ScraperService Edge Cases", () => {
    it("should return thread when API returns data without tweet property", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ code: 200 }),
      });
      const result = await ScraperService.fetchThread("1", []);
      expect(result).toEqual([]);
      global.fetch = originalFetch;
    });

    it("should stop fetching when thread length reaches 10", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tweet: {
              author: { screen_name: "u" },
              text: "T",
              replying_to_status: "1",
            },
          }),
      });
      const existing = Array(9).fill({
        author: { screen_name: "u" },
        text: "T",
      });
      const result = await ScraperService.fetchThread("1", existing);
      expect(result.length).toBe(10);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      global.fetch = originalFetch;
    });

    it("should handle tweet without replying_to_status", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tweet: { author: { screen_name: "u" }, text: "orig" },
          }),
      });
      const result = await ScraperService.fetchThread("123", []);
      expect(result.length).toBe(1);
      expect(result[0].text).toBe("orig");
      global.fetch = originalFetch;
    });

    it("should handle fetchThread errors gracefully", async () => {
      jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
      const originalFetchThread = ScraperService.fetchThread;
      ScraperService.fetchThread = jest
        .fn()
        .mockRejectedValue(new Error("fail"));
      const result = await ScraperService.scrapeTweet(
        "https://x.com/u/status/123",
      );
      expect(result).toContain("Error: Failed to reach the scraping service");
      ScraperService.fetchThread = originalFetchThread;
    });
  });
});
