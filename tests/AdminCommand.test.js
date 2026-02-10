const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const AdminCommand = require("../src/commands/AdminCommand");
const { admin } = require("../config");
const { createMockInteraction, silenceConsole } = require("./helpers");

describe("AdminCommand", () => {
  let mockInteraction;

  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
    const { interaction } = createMockInteraction();
    mockInteraction = interaction;
    mockInteraction.options = { getSubcommand: jest.fn() };
    mockInteraction.client = {
      guilds: {
        cache: { get: jest.fn().mockReturnValue({ name: "Test Server" }) },
      },
    };
    admin.userId = "admin123";
    mockInteraction.user.id = "admin123";
  });

  it("should deny non-admin users", async () => {
    mockInteraction.user.id = "wronguser";
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("permission"),
      }),
    );
  });

  it("should clear cache for admin", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("clear-cache");
    const spy = jest
      .spyOn(db, "clearChannelCache")
      .mockImplementation(() => {});
    await AdminCommand.execute(mockInteraction);
    expect(spy).toHaveBeenCalled();
  });

  it("should show stats for admin", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("stats");
    jest.spyOn(db, "getDetailedStats").mockReturnValue({
      topUsers: [{ user_id: "u1", total_cost: 0.1, total_tokens: 100 }],
      topGuilds: [{ guild_id: "g1", total_cost: 0.1 }],
      modelStats: [{ model: "m1", total_cost: 0.1, count: 1 }],
      totalTokens: 100,
      totalCost: 0.1,
    });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle errors in clear-cache", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("clear-cache");
    jest.spyOn(db, "clearChannelCache").mockImplementation(() => {
      throw new Error("DB error");
    });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle empty stats branches", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("stats");
    jest.spyOn(db, "getDetailedStats").mockReturnValue({
      topUsers: [],
      topGuilds: [],
      modelStats: [],
      totalTokens: 0,
      totalCost: 0,
    });

    await AdminCommand.execute(mockInteraction);
    const replyArg = mockInteraction.reply.mock.calls[0][0];
    expect(replyArg.content).toContain("No usage data yet");
  });

  it("should handle stats errors gracefully", async () => {
    mockInteraction.options.getSubcommand.mockReturnValue("stats");
    jest.spyOn(db, "getDetailedStats").mockImplementation(() => {
      throw new Error("boom");
    });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Failed to fetch stats"),
      }),
    );
  });
});
