// Mock DatabaseService BEFORE requiring other services
jest.mock("../src/services/DatabaseService", () => {
  return {
    getCachedTweet: jest.fn(),
    saveTweet: jest.fn(),
    getCachedSummary: jest.fn(),
    saveSummary: jest.fn(),
  };
});

const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");
const axios = require("axios");

// Manually mock axios
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
    db.getCachedTweet.mockReturnValue({ content: "Cached Content" });
    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );
    expect(result).toBe("Cached Content");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("should fetch and cache tweet if not in DB", async () => {
    db.getCachedTweet.mockReturnValue(null);
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
    expect(db.saveTweet).toHaveBeenCalled();
  });

  it("should unroll threads and cache result", async () => {
    db.getCachedTweet.mockReturnValue(null);
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
    expect(db.saveTweet).toHaveBeenCalled();
  });

  it("should handle API failures gracefully", async () => {
    db.getCachedTweet.mockReturnValue(null);
    axios.get.mockRejectedValue(new Error("API Fail"));
    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );
    expect(result).toContain("Could not fetch tweet content");
  });

  it("should handle invalid URLs", async () => {
    const result = await ScraperService.scrapeTweet("https://google.com");
    expect(result).toContain("Could not extract tweet ID");
  });

  it("should handle fatal errors in scrapeTweet", async () => {
    // Force the catch block by mocking fetchThread
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
