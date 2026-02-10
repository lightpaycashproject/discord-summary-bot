const {
  expect,
  it,
  describe,
  beforeEach,
  afterEach,
  jest,
} = require("bun:test");
const scraperService = require("../src/services/ScraperService");
const db = require("../src/services/DatabaseService");

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
    // Mock fetch to return data without tweet
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ code: 200, message: "OK" }), // No tweet property
    });

    const result = await scraperService.fetchThread("123456", []);

    expect(result).toEqual([]);
  });

  it("should stop fetching when thread length reaches 10", async () => {
    // Create a chain of 11 tweets
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
});
