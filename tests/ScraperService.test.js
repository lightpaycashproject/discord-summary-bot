const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const scraperService = require("../src/services/ScraperService");
const { silenceConsole } = require("./helpers");

describe("ScraperService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  it("should scrape all links from text", async () => {
    const text = "https://x.com/u/status/1";
    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue("C");
    const { contextMap } = await scraperService.scrapeAllFromText(text);
    expect(contextMap.size).toBe(1);
  });

  it("should handle scrape errors and exceptions in scrapeAllFromText", async () => {
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockResolvedValueOnce("[Error: Fail]")
      .mockRejectedValueOnce(new Error("Fail"));
    const { failures } = await scraperService.scrapeAllFromText(
      "https://x.com/u/status/1 https://x.com/u/status/2",
    );
    expect(failures).toBe(2);
  });

  it("should return empty map if no links found", async () => {
    const { contextMap } = await scraperService.scrapeAllFromText("no links");
    expect(contextMap.size).toBe(0);
  });

  it("should unroll threads and cache result", async () => {
    jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    jest.spyOn(db, "saveTweet").mockImplementation(() => {});
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

    const result = await scraperService.scrapeTweet("https://x.com/u/status/2");
    expect(result).toContain("T1");
    global.fetch = originalFetch;
  });

  it("should handle fetchThread errors and private tweets", async () => {
    jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    jest.spyOn(scraperService, "fetchThread").mockResolvedValue([]);
    const result = await scraperService.scrapeTweet("https://x.com/u/status/1");
    expect(result).toContain("Warning");

    jest
      .spyOn(scraperService, "fetchThread")
      .mockRejectedValue(new Error("fail"));
    const res2 = await scraperService.scrapeTweet("https://x.com/u/status/1");
    expect(res2).toContain("Error");
  });

  it("should extract tweet ID and format correctly", () => {
    expect(scraperService.extractTweetId("https://x.com/u/status/123")).toBe(
      "123",
    );
    expect(scraperService.extractTweetId("invalid")).toBeNull();

    const tweet = {
      author: { screen_name: "u" },
      text: "t",
      media: { all: [{ url: "m1" }] },
      quote: {
        author: { screen_name: "q" },
        text: "qt",
        media: { all: [{ url: "m2" }] },
      },
    };
    const res = scraperService.formatTweet(tweet);
    expect(res).toContain("m2");
  });

  it("should handle fetchThread API failure and recursion limit", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await scraperService.fetchThread("1")).toEqual([]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tweet: { replying_to_status: "123" } }),
    });
    // Hit limit
    const res = await scraperService.fetchThread("1", Array(10).fill({}));
    expect(res.length).toBe(11);

    global.fetch = originalFetch;
  });

  it("should handle fetchThread catch block", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("fetch fail"));
    const res = await scraperService.fetchThread("1");
    expect(res).toEqual([]);
    global.fetch = originalFetch;
  });

  it("should handle invalid url in scrapeTweet", async () => {
    expect(await scraperService.scrapeTweet("invalid")).toContain("Error");
  });

  it("should return cached tweet if available", async () => {
    jest.spyOn(db, "getCachedTweet").mockReturnValue({ content: "C" });
    expect(await scraperService.scrapeTweet("https://x.com/1")).toBe("C");
  });
});
