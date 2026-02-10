const axios = require("axios");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");

// Manually spy on axios and db
axios.get = jest.fn();

describe("ScraperService with Caching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(axios.get).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should fetch and cache tweet if not in DB", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    const spySave = jest.spyOn(db, "saveTweet").mockReturnValue(null);

    const mockTweet = {
      author: { screen_name: "test" },
      text: "New tweet",
      replying_to_status: null,
    };
    axios.get.mockResolvedValue({ data: { tweet: mockTweet } });

    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/456",
    );
    expect(result).toBe("@test: New tweet");
    expect(spySave).toHaveBeenCalled();

    spyGet.mockRestore();
    spySave.mockRestore();
  });

  it("should unroll threads and cache result", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    const spySave = jest.spyOn(db, "saveTweet").mockReturnValue(null);

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

    axios.get
      .mockResolvedValueOnce({ data: { tweet: tweet2 } })
      .mockResolvedValueOnce({ data: { tweet: tweet1 } });

    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/2",
    );
    expect(result).toContain("T1");
    expect(result).toContain("T2");
    expect(spySave).toHaveBeenCalled();

    spyGet.mockRestore();
    spySave.mockRestore();
  });

  it("should handle API failures gracefully", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    axios.get.mockRejectedValue(new Error("API Fail"));
    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );
    expect(result).toContain("Could not fetch tweet content");
    spyGet.mockRestore();
  });

  it("should handle invalid URLs", async () => {
    const result = await ScraperService.scrapeTweet("https://google.com");
    expect(result).toContain("Could not extract tweet ID");
  });

  it("should handle fatal errors in scrapeTweet", async () => {
    const originalFetch = ScraperService.fetchThread;
    ScraperService.fetchThread = jest
      .fn()
      .mockRejectedValue(new Error("Fatal"));

    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );
    expect(result).toContain("Error fetching tweet: Fatal");

    ScraperService.fetchThread = originalFetch;
  });

  it("should format tweets with quotes correctly", () => {
    const tweet = {
      author: { screen_name: "userA" },
      text: "textA",
      quote: { author: { screen_name: "userB" }, text: "textB" },
    };
    const output = ScraperService.formatTweet(tweet);
    expect(output).toContain("Quoting @userB");
  });
});
