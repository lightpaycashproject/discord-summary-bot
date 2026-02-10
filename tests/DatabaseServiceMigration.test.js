const { expect, it, describe, beforeEach, jest } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService Migration", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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
});
