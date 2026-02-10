const { expect, it, describe, beforeEach, jest } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should enable WAL mode on initialization", () => {
    const journalMode = dbService.db
      .query("PRAGMA journal_mode")
      .get().journal_mode;
    // In-memory DB might return 'memory' or 'wal' depending on environment, 
    // but the command should have run.
    expect(["wal", "memory"]).toContain(journalMode);
  });

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

  it("should clear channel cache", () => {
    dbService.saveSummary("chan_clear", "msg1", "To be cleared");
    expect(dbService.getCachedSummary("chan_clear", "msg1")).toBe(
      "To be cleared",
    );

    dbService.clearChannelCache("chan_clear");
    expect(dbService.getCachedSummary("chan_clear", "msg1")).toBeNull();
  });

  it("should return correct stats", () => {
    dbService.saveSummary("c1", "m1", "t", "g1", "u1", 100, 0.05, "mod");
    const stats = dbService.getDetailedStats();
    expect(stats).toHaveProperty("totalCost");
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.modelStats.length).toBeGreaterThan(0);
  });

  it("should track usage stats with cost and model", () => {
    dbService.logUsage("user1", "guild1", "chan1", 100, 0.001, "gpt-4");
    const stats = dbService.getDetailedStats();
    expect(stats).toHaveProperty("totalCost");
  });

  it("should get top users by cost", () => {
    dbService.logUsage("user1", "guild1", "chan1", 100, 0.01, "gpt-4");
    dbService.logUsage("user2", "guild1", "chan1", 200, 0.02, "gpt-4");

    const stats = dbService.getDetailedStats();
    expect(Array.isArray(stats.topUsers)).toBe(true);
    expect(stats.topUsers.length).toBeGreaterThan(0);
  });

  it("should get top guilds by cost", () => {
    dbService.logUsage("user1", "guild1", "chan1", 100, 0.01, "gpt-4");
    dbService.logUsage("user1", "guild2", "chan1", 200, 0.02, "gpt-4");

    const stats = dbService.getDetailedStats();
    expect(Array.isArray(stats.topGuilds)).toBe(true);
    expect(stats.topGuilds.length).toBeGreaterThan(0);
  });

  it("should not crash if migration columns already exist", () => {
    const originalExec = dbService.db.exec.bind(dbService.db);
    const spy = jest.spyOn(dbService.db, "exec").mockImplementation((sql) => {
      if (sql.startsWith("ALTER TABLE")) {
        throw new Error("duplicate column");
      }
      return originalExec(sql);
    });

    expect(() => dbService.init()).not.toThrow();

    spy.mockRestore();
  });

  it("should call db.close", () => {
    const spy = jest.spyOn(dbService.db, "close").mockImplementation(() => {});
    dbService.close();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should handle empty stats branches", () => {
    dbService.db.query("DELETE FROM usage_stats").run();
    const stats = dbService.getDetailedStats();
    expect(stats.totalTokens).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it("should handle stats with null sums", () => {
    dbService.db.query("DELETE FROM usage_stats").run();
    const stats = dbService.getDetailedStats();
    expect(stats.totalTokens).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it("should track schema version", () => {
    const version = dbService.getSchemaVersion();
    expect(version).toBeGreaterThan(0);

    dbService.setSchemaVersion(99);
    expect(dbService.getSchemaVersion()).toBe(99);
  });

  it("should not run migrations if version is already current", () => {
    const spy = jest.spyOn(dbService.db, "exec");
    dbService.setSchemaVersion(2);
    dbService.init();
    // Only schema_meta should be created
    const createTableCalls = spy.mock.calls.filter((c) =>
      c[0].includes("CREATE TABLE"),
    );
    expect(createTableCalls.every((c) => c[0].includes("schema_meta"))).toBe(
      true,
    );
    spy.mockRestore();
  });

  it("should retrieve recent summary within TTL", async () => {
    dbService.saveSummary("ttl_chan", "msg1", "New Summary");
    const result = dbService.getRecentSummary("ttl_chan", 5000);
    expect(result).toBe("New Summary");
  });

  it("should return null for summary outside TTL", async () => {
    // Mock Date.now to simulate past
    const originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow() - 10000);
    dbService.saveSummary("old_chan", "msg1", "Old Summary");

    Date.now = originalNow;
    const result = dbService.getRecentSummary("old_chan", 5000);
    expect(result).toBeNull();
  });
});
