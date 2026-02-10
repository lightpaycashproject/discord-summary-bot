const { expect, it, describe, beforeEach, jest } = require("bun:test");
const dbService = require("../src/services/DatabaseService");
const { silenceConsole } = require("./helpers");

describe("DatabaseService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  it("should enable WAL mode on initialization", () => {
    const journalMode = dbService.db.query("PRAGMA journal_mode").get().journal_mode;
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

  it("should track usage stats", () => {
    dbService.logUsage("u1", "g1", "c1", 100, 0.001, "gpt-4");
    expect(dbService.getDetailedStats().totalCost).toBeGreaterThan(0);
  });

  it("should get top users and guilds", () => {
    dbService.logUsage("user1", "guild1", "chan1", 100, 0.01, "gpt-4");
    dbService.logUsage("user2", "guild2", "chan1", 200, 0.02, "gpt-4");
    const stats = dbService.getDetailedStats();
    expect(stats.topUsers.length).toBeGreaterThan(0);
    expect(stats.topGuilds.length).toBeGreaterThan(0);
  });

  it("should handle error in version 2 migration columns", () => {
    dbService.setSchemaVersion(1);
    const originalExec = dbService.db.exec.bind(dbService.db);
    jest.spyOn(dbService.db, "exec").mockImplementation((sql) => {
      if (sql.startsWith("ALTER TABLE")) throw new Error("exists");
      return originalExec(sql);
    });
    expect(() => dbService.init()).not.toThrow();
  });

  it("should handle stats when query returns null", () => {
    jest.spyOn(dbService.db, "query").mockReturnValue({ all: () => [], get: () => null });
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
    expect(spy.mock.calls.filter(c => c[0].includes("CREATE TABLE")).every(c => c[0].includes("schema_meta"))).toBe(true);
  });

  it("should retrieve recent summary within TTL", () => {
    dbService.saveSummary("ttl", "m", "S");
    expect(dbService.getRecentSummary("ttl", 5000)).toBe("S");
  });

  it("should return null for summary outside TTL", () => {
    const originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow() - 10000);
    dbService.saveSummary("old", "m", "S");
    Date.now = originalNow;
    expect(dbService.getRecentSummary("old", 5000)).toBeNull();
  });

  it("should save and retrieve messages", () => {
    const now = Date.now();
    dbService.saveMessage("m1", "c1", "g1", "u1", "usr", "H", now);
    expect(dbService.getMessages("c1", now).length).toBe(1);
  });

  it("should call db.close", () => {
    const spy = jest.spyOn(dbService.db, "close").mockImplementation(() => {});
    dbService.close();
    expect(spy).toHaveBeenCalled();
  });
});
