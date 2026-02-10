const { expect, it, describe, beforeEach, jest } = require("bun:test");
const HelpCommand = require("../src/commands/HelpCommand");

describe("HelpCommand", () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      reply: jest.fn().mockResolvedValue({}),
    };
    jest.restoreAllMocks();
  });

  it("should return a help embed", async () => {
    await HelpCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyCall = mockInteraction.reply.mock.calls[0][0];
    expect(replyCall).toHaveProperty("embeds");
    expect(replyCall.ephemeral).toBe(true);
  });
});
