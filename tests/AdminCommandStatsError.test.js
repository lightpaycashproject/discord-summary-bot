const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const AdminCommand = require("../src/commands/AdminCommand");
const { admin } = require("../config");

describe("AdminCommand (Stats Error)", () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      user: { id: "admin123" },
      channelId: "chan123",
      options: { getSubcommand: jest.fn().mockReturnValue("stats") },
      client: {
        guilds: { cache: { get: jest.fn().mockReturnValue(null) } },
      },
      reply: jest.fn().mockResolvedValue({}),
    };
    admin.userId = "admin123";
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should handle stats errors gracefully", async () => {
    const spy = jest.spyOn(db, "getDetailedStats").mockImplementation(() => {
      throw new Error("boom");
    });

    await AdminCommand.execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Failed to fetch stats." }),
    );

    spy.mockRestore();
  });
});
