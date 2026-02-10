const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");

describe("ScraperService with Caching", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

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

    const result = await ScraperService.scrapeTweet("https://x.com/u/status/2");
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
    expect(result).toContain("Could not fetch tweet content");

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
    expect(result).toContain("Error fetching tweet: Fatal");

    ScraperService.fetchThread = originalFetchThread;
  });
});
