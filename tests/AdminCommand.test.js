const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const AdminCommand = require("../src/commands/AdminCommand");
const { admin } = require("../config");

describe("AdminCommand", () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      user: { id: "admin123" },
      channelId: "chan123",
      options: {
        getSubcommand: jest.fn(),
      },
      reply: jest.fn().mockResolvedValue({}),
    };
    admin.userId = "admin123";
    jest.restoreAllMocks();
  });

  it("should deny non-admin users", async () => {
    mockInteraction.user.id = "wronguser";
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should clear cache for admin", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("clear-cache");
    const spy = jest
      .spyOn(db, "clearChannelCache")
      .mockImplementation(() => {});
    await AdminCommand.execute(mockInteraction);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should show stats for admin", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("stats");
    const spy = jest
      .spyOn(db, "getStats")
      .mockReturnValue({ tweets: 10, summaries: 5 });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should handle errors in clear-cache", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("clear-cache");
    const spy = jest.spyOn(db, "clearChannelCache").mockImplementation(() => {
      throw new Error("DB error");
    });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
    spy.mockRestore();
  });
});
