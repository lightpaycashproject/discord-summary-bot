const { expect, it, describe } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService", () => {
  it("should save and retrieve a tweet", () => {
    dbService.saveTweet("https://x.com/test1", "Tweet Content");
    const row = dbService.getCachedTweet("https://x.com/test1");
    expect(row.content).toBe("Tweet Content");
  });

  it("should return null or undefined for missing tweet", () => {
    const row = dbService.getCachedTweet("https://x.com/missing");
    expect(row).toBeNull();
  });

  it("should save and retrieve a summary", () => {
    dbService.saveSummary("chan_test", "msg_test", "Summary Test");
    const result = dbService.getCachedSummary("chan_test", "msg_test");
    expect(result).toBe("Summary Test");
  });

  it("should return null for non-matching last_message_id", () => {
    dbService.saveSummary("chan_test", "msg_old", "Summary Old");
    const result = dbService.getCachedSummary("chan_test", "msg_new");
    expect(result).toBeNull();
  });
});
