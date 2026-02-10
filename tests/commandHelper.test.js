const { expect, it, describe, jest } = require("bun:test");
const { handleCommandError } = require("../src/utils/commandHelper");

describe("CommandHelper", () => {
  it("should reply if not deferred or replied", async () => {
    const interaction = {
      commandName: "test",
      reply: jest.fn().mockResolvedValue({}),
      deferred: false,
      replied: false,
    };
    await handleCommandError(interaction, new Error("fail"));
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
  });

  it("should editReply if deferred", async () => {
    const interaction = {
      commandName: "test",
      editReply: jest.fn().mockResolvedValue({}),
      deferred: true,
      replied: false,
    };
    await handleCommandError(interaction, new Error("fail"));
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it("should log failure to send error reply", async () => {
    const interaction = {
      commandName: "test",
      reply: jest.fn().mockRejectedValue(new Error("network fail")),
    };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await handleCommandError(interaction, new Error("orig"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send"),
      "network fail",
    );
    spy.mockRestore();
  });
});
