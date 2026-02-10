const axios = require("axios");
const db = require("../src/services/DatabaseService");
const ScraperService = require("../src/services/ScraperService");

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

  it("should handle partial thread failure in fetchThread", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    const tweet = {
      author: { screen_name: "u" },
      text: "T",
      replying_to_status: "1",
    };
    axios.get
      .mockResolvedValueOnce({ data: { tweet: tweet } })
      .mockRejectedValueOnce(new Error("Network fail"));

    const result = await ScraperService.scrapeTweet("https://x.com/u/status/2");
    expect(result).toContain("@u: T");
    spyGet.mockRestore();
  });

  it("should handle the real-world example with quotes correctly", async () => {
    const spyGet = jest.spyOn(db, "getCachedTweet").mockReturnValue(null);
    const spySave = jest.spyOn(db, "saveTweet").mockImplementation(() => {});

    const mockTweet = {
      author: { screen_name: "derteil00" },
      text: "I waited for them to tweet...",
      quote: {
        author: { screen_name: "saylor" },
        text: "Strategy has acquired 1,142 BTC...",
      },
    };
    axios.get.mockResolvedValue({ data: { tweet: mockTweet } });

    const result = await ScraperService.scrapeTweet(
      "https://x.com/derteil00/status/2020857102021914803",
    );

    expect(result).toContain("@derteil00");
    expect(result).toContain("I waited for them");
    expect(result).toContain("[Quoting @saylor]: Strategy has acquired");

    spyGet.mockRestore();
    spySave.mockRestore();
  });

  it("should include media images in formatting", () => {
    const tweet = {
      author: { screen_name: "user" },
      text: "Look at this",
      media: {
        photos: [
          { url: "https://x.com/img1.jpg" },
          { url: "https://x.com/img2.jpg" },
        ],
      },
    };
    const output = ScraperService.formatTweet(tweet);
    expect(output).toContain("https://x.com/img1.jpg");
    expect(output).toContain("https://x.com/img2.jpg");
  });

  it("should include quoted tweet media", () => {
    const tweet = {
      author: { screen_name: "user" },
      text: "Check this quote",
      quote: {
        author: { screen_name: "quoted" },
        text: "Quoted text",
        media: {
          photos: [{ url: "https://x.com/quote_img.jpg" }],
        },
      },
    };
    const output = ScraperService.formatTweet(tweet);
    expect(output).toContain("https://x.com/quote_img.jpg");
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
    ScraperService.fetchThread = jest.fn().mockRejectedValue(new Error("Fatal"));

    const result = await ScraperService.scrapeTweet(
      "https://x.com/user/status/123",
    );
    expect(result).toContain("Error fetching tweet: Fatal");

    ScraperService.fetchThread = originalFetch;
  });
});
