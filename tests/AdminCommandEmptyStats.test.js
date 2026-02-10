const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const AdminCommand = require("../src/commands/AdminCommand");
const { admin } = require("../config");

describe("AdminCommand (Empty Stats)", () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      user: { id: "admin123" },
      channelId: "chan123",
      options: { getSubcommand: jest.fn().mockReturnValue("stats") },
      client: {
        guilds: {
          cache: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      },
      reply: jest.fn().mockResolvedValue({}),
    };
    admin.userId = "admin123";
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should handle empty stats branches", async () => {
    const spy = jest.spyOn(db, "getDetailedStats").mockReturnValue({
      topUsers: [],
      topGuilds: [],
      modelStats: [],
      totalTokens: 0,
      totalCost: 0,
    });

    await AdminCommand.execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyArg = mockInteraction.reply.mock.calls[0][0];
    expect(replyArg.content).toContain("No usage data yet");
    expect(replyArg.content).toContain("No server data yet");
    expect(replyArg.content).toContain("No model data yet");

    spy.mockRestore();
  });
});
