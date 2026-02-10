const { expect, it, describe, jest } = require("bun:test");
const { createMockInteraction, createMockMessage, silenceConsole } = require("./helpers");

describe("Helpers", () => {
  it("should create a mock interaction with default isCommand", () => {
    const { interaction } = createMockInteraction();
    expect(interaction.isCommand()).toBe(true);
  });

  it("should create a mock message with specific id", () => {
    const msg = createMockMessage("999", 1000, "hello", "tester");
    expect(msg.id).toBe("999");
    expect(msg.author.username).toBe("tester");
  });

  it("should silence console", () => {
    const spyError = jest.spyOn(console, "error").mockImplementation(() => {});
    const spyLog = jest.spyOn(console, "log").mockImplementation(() => {});
    
    silenceConsole();
    console.error("test");
    console.log("test");
    
    expect(spyError).toHaveBeenCalled();
    expect(spyLog).toHaveBeenCalled();
    
    spyError.mockRestore();
    spyLog.mockRestore();
  });
});
