const { expect, it, describe } = require("bun:test");
const ScraperService = require("../src/services/ScraperService");

describe("ScraperService Invalid URL", () => {
  it("should return message when tweet ID cannot be extracted", async () => {
    const result = await ScraperService.scrapeTweet("https://example.com");
    expect(result).toContain("Error: Could not extract tweet ID");
  });
});
