const { expect, it, describe } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService Extended", () => {
  it("should clear channel cache", () => {
    dbService.saveSummary("chan_clear", "msg1", "To be cleared");
    expect(dbService.getCachedSummary("chan_clear", "msg1")).toBe(
      "To be cleared",
    );

    dbService.clearChannelCache("chan_clear");
    expect(dbService.getCachedSummary("chan_clear", "msg1")).toBeNull();
  });

  it("should return correct stats", () => {
    const stats = dbService.getStats();
    expect(stats).toHaveProperty("tweets");
    expect(stats).toHaveProperty("summaries");
  });
});
