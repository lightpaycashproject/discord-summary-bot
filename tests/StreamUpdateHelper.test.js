const { expect, it, describe, beforeEach, jest } = require("bun:test");
const { StreamUpdateHelper } = require("../src/commands/SummarizeCommand");

describe("StreamUpdateHelper", () => {
  let mockDmMessage;

  beforeEach(() => {
    mockDmMessage = {
      edit: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should update DM when interval has passed", async () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "general", 100);
    // Wait for interval to pass
    await new Promise((resolve) => setTimeout(resolve, 150));

    await helper.maybeUpdate("Test summary text");

    expect(mockDmMessage.edit).toHaveBeenCalledWith(
      "**Conversation Summary for #general (Last 24h)**\n\nTest summary text ▌",
    );
  });

  it("should skip update when interval has not passed", async () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "general", 5000);

    await helper.maybeUpdate("Test summary text");

    expect(mockDmMessage.edit).not.toHaveBeenCalled();
  });

  it("should handle DM edit errors gracefully", async () => {
    mockDmMessage.edit = jest
      .fn()
      .mockRejectedValue(new Error("DM edit failed"));

    const helper = new StreamUpdateHelper(mockDmMessage, "general", 1);
    // Wait for interval to pass
    await new Promise((resolve) => setTimeout(resolve, 10));
    await helper.maybeUpdate("Test summary text");

    expect(mockDmMessage.edit).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to update DM stream:",
      "DM edit failed",
    );
  });

  it("should use default update interval", async () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "general");
    expect(helper.updateInterval).toBe(1500);
  });
});
