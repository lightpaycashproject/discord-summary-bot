const { expect, it, describe, beforeEach, jest } = require("bun:test");
const { StreamUpdateHelper } = require("../src/commands/SummarizeCommand");

describe("StreamUpdateHelper", () => {
  let mockDmMessage;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDmMessage = {
      edit: jest.fn().mockResolvedValue({}),
    };
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should update DM when interval has passed", async () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "test-channel", 5); // 5ms interval

    // Initial update should set the baseline
    await helper.maybeUpdate("First update");
    expect(mockDmMessage.edit).toHaveBeenCalledTimes(0); // first call just sets time

    // Wait for interval to pass
    await new Promise((resolve) => setTimeout(resolve, 10));

    await helper.maybeUpdate("Second update");
    expect(mockDmMessage.edit).toHaveBeenCalledTimes(1);
    expect(mockDmMessage.edit).toHaveBeenCalledWith(
      expect.stringContaining("Second update"),
    );
  });

  it("should skip update when interval has not passed", async () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "test-channel", 1000);

    await helper.maybeUpdate("First update");
    await helper.maybeUpdate("Too soon");

    expect(mockDmMessage.edit).not.toHaveBeenCalled();
  });

  it("should handle DM edit errors gracefully", async () => {
    mockDmMessage.edit.mockRejectedValue(new Error("DM edit failed"));
    const helper = new StreamUpdateHelper(mockDmMessage, "test-channel", 5);

    await helper.maybeUpdate("Initial"); // set time
    
    // Wait for interval to pass
    await new Promise((resolve) => setTimeout(resolve, 10));
    await helper.maybeUpdate("Test summary text");

    expect(mockDmMessage.edit).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to update channel stream:",
      "DM edit failed",
    );
  });

  it("should use default update interval", () => {
    const helper = new StreamUpdateHelper(mockDmMessage, "test-channel");
    expect(helper.updateInterval).toBe(1500);
  });
});
