const { expect, it, describe, beforeEach, jest } = require("bun:test");
const dbService = require("../src/services/DatabaseService");

describe("DatabaseService close", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should call db.close", () => {
    const spy = jest.spyOn(dbService.db, "close").mockImplementation(() => {});
    dbService.close();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
