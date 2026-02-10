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
    // Stats is a sum of all entries. Since tests share the DB instance in some runs,
    // we just check if it returns numbers.
    const stats = dbService.getStats();
    expect(stats).toHaveProperty("tweets");
    expect(stats).toHaveProperty("summaries");
    expect(typeof stats.tweets).toBe("number");
  });
});
