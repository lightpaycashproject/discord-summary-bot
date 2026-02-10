const { expect, it, describe, beforeEach, jest } = require("bun:test");
const SummarizerService = require("../src/services/SummarizerService");

describe("SummarizerService Non-Streaming Usage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should include usage/model even when response.model is missing", async () => {
    const mockResponse = {
      choices: [{ message: { content: "Summary result" } }],
      usage: { total_tokens: 10, total_cost: 0.001 },
      model: undefined,
    };
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockResponse);

    const result = await SummarizerService.summarize("Long content");
    expect(result.model).toBeDefined();
    expect(result.usage.total_cost).toBe(0.001);
    spy.mockRestore();
  });
});
