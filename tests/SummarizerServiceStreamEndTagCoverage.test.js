const { expect, it, describe, beforeEach, jest } = require("bun:test");
const SummarizerService = require("../src/services/SummarizerService");

describe("SummarizerService Stream End Tag Coverage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should handle stream with no closing </think>", async () => {
    const mockStream = [
      { choices: [{ delta: { content: "Hello <think>hidden" } }] },
    ];

    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);

    const result = await SummarizerService.summarize("Content", () => {});
    expect(result.summary).toBe("Hello");

    spy.mockRestore();
  });
});
