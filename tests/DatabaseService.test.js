const { expect, it, describe, beforeEach, jest } = require("bun:test");
const dbService = require("../src/services/DatabaseService");
const { silenceConsole } = require("./helpers");

describe("DatabaseService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  it("should enable WAL mode on initialization", () => {
    const journalMode = dbService.db
      .query("PRAGMA journal_mode")
      .get().journal_mode;
    expect(["wal", "memory"]).toContain(journalMode);
  });

  it("should save and retrieve a tweet", () => {
    dbService.saveTweet("https://x.com/t1", "C");
    expect(dbService.getCachedTweet("https://x.com/t1").content).toBe("C");
  });

  it("should return null for missing tweet", () => {
    expect(dbService.getCachedTweet("https://x.com/m")).toBeNull();
  });

  it("should save and retrieve a summary", () => {
    dbService.saveSummary("c", "m", "S");
    expect(dbService.getCachedSummary("c", "m")).toBe("S");
  });

  it("should return null for non-matching summary id", () => {
    dbService.saveSummary("c", "old", "S");
    expect(dbService.getCachedSummary("c", "new")).toBeNull();
  });

  it("should clear channel cache", () => {
    dbService.saveSummary("clr", "m", "T");
    dbService.clearChannelCache("clr");
    expect(dbService.getCachedSummary("clr", "m")).toBeNull();
  });

  it("should return correct stats", () => {
    dbService.saveSummary("c1", "m1", "t", "g1", "u1", 100, 0.05, "mod");
    const stats = dbService.getDetailedStats();
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.modelStats.length).toBeGreaterThan(0);
  });

  it("should get top users by cost", () => {
    dbService.db.query("DELETE FROM usage_stats").run();
    dbService.logUsage("u1", "g1", "c1", 100, 0.01, "m1");
    dbService.logUsage("u2", "g1", "c1", 200, 0.02, "m1");
    const stats = dbService.getDetailedStats();
    expect(stats.topUsers[0].user_id).toBe("u2");
  });

  it("should get top guilds by cost", () => {
    dbService.db.query("DELETE FROM usage_stats").run();
    dbService.logUsage("u1", "g1", "c1", 100, 0.01, "m1");
    dbService.logUsage("u1", "g2", "c1", 200, 0.02, "m1");
    const stats = dbService.getDetailedStats();
    expect(stats.topGuilds[0].guild_id).toBe("g2");
  });

  it("should handle error in version 2 migration columns", () => {
    dbService.setSchemaVersion(1);
    const spy = jest.spyOn(dbService.db, "exec").mockImplementation((sql) => {
      if (sql.startsWith("ALTER TABLE")) throw new Error("exists");
      if (sql.includes("CREATE TABLE")) return;
      return;
    });
    expect(() => dbService.init()).not.toThrow();
    spy.mockRestore();
  });

  it("should handle stats when query returns null", () => {
    jest
      .spyOn(dbService.db, "query")
      .mockReturnValue({ all: () => [], get: () => null });
    const stats = dbService.getDetailedStats();
    expect(stats.totalTokens).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  it("should track schema version", () => {
    dbService.setSchemaVersion(99);
    expect(dbService.getSchemaVersion()).toBe(99);
  });

  it("should not run migrations if version is current", () => {
    const spy = jest.spyOn(dbService.db, "exec");
    dbService.setSchemaVersion(3);
    dbService.init();
    const calls = spy.mock.calls.filter((c) => c[0].includes("CREATE TABLE"));
    expect(calls.every((c) => c[0].includes("schema_meta"))).toBe(true);
    spy.mockRestore();
  });

  it("should handle error during schema version check", () => {
    const originalQuery = dbService.db.query;
    dbService.db.query = () => {
      throw new Error("fatal");
    };
    expect(dbService.getSchemaVersion()).toBe(0);
    dbService.db.query = originalQuery;
  });

  it("should handle error during schema version set", () => {
    const originalQuery = dbService.db.query;
    dbService.db.query = () => {
      throw new Error("fatal");
    };
    expect(() => dbService.setSchemaVersion(1)).not.toThrow();
    dbService.db.query = originalQuery;
  });

  it("should retrieve recent summary within TTL", () => {
    dbService.saveSummary("ttl", "m", "S");
    expect(dbService.getRecentSummary("ttl", 5000)).toBe("S");
  });

  it("should return null for summary outside TTL", () => {
    const originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow() - 1000000);
    dbService.saveSummary("old", "m", "S");
    Date.now = originalNow;
    expect(dbService.getRecentSummary("old", 5000)).toBeNull();
  });

  it("should save and retrieve messages", () => {
    const now = Date.now();
    dbService.saveMessage("m1", "c1", "g1", "u1", "usr", "H", now);
    expect(dbService.getMessages("c1", now).length).toBe(1);
  });

  it("should prune messages", () => {
    const now = Date.now();
    dbService.saveMessage("old", "c", "g", "u", "n", "t", now - 1000000000);
    dbService.pruneMessages(1);
    expect(dbService.getMessages("c", 0).length).toBe(0);
  });

  it("should call db.close", () => {
    const spy = jest.spyOn(dbService.db, "close").mockImplementation(() => {});
    dbService.close();
    expect(spy).toHaveBeenCalled();
  });
});
