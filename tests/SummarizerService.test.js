const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const SummarizerService = require("../src/services/SummarizerService");

describe("SummarizerService with Caching", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should call DB for cached summary", () => {
    const spy = jest
      .spyOn(db, "getCachedSummary")
      .mockReturnValue("Cached summary");
    const result = SummarizerService.getCachedSummary("chan1", "msg1");
    expect(result).toBe("Cached summary");
    spy.mockRestore();
  });

  it("should call SDK and return summary (non-streaming)", async () => {
    const mockResponse = {
      choices: [{ message: { content: "Summary result" } }],
      usage: { total_tokens: 50, total_cost: 0.001 },
      model: "test-model",
    };
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockResponse);

    const result = await SummarizerService.summarize("Long content");
    expect(result.summary).toBe("Summary result");
    expect(result.usage.total_tokens).toBe(50);
    spy.mockRestore();
  });

  it("should handle streaming summary and filter <think> tags", async () => {
    const mockStream = [
      { choices: [{ delta: { content: "Hello " } }] },
      { choices: [{ delta: { content: "<think>thinking</think>world" } }] },
    ];
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);

    const updates = [];
    const result = await SummarizerService.summarize("Content", (t) =>
      updates.push(t),
    );

    expect(result.summary).toBe("Hello world");
    expect(updates).toContain("Hello ");
    spy.mockRestore();
  });

  it("should handle partial <think> tags across chunks", async () => {
    const mockStream = [
      { choices: [{ delta: { content: "Start " } }] },
      { choices: [{ delta: { content: "<th" } }] },
      { choices: [{ delta: { content: "ink>secret</think>End" } }] },
    ];
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);

    const result = await SummarizerService.summarize("Content", () => {});
    expect(result.summary).toBe("Start End");
    spy.mockRestore();
  });

  it("should save summary to DB", () => {
    const spy = jest.spyOn(db, "saveSummary").mockImplementation(() => {});
    SummarizerService.saveSummary(
      "c1",
      "m1",
      "txt",
      "g1",
      "u1",
      10,
      0.1,
      "mod",
    );
    expect(spy).toHaveBeenCalledWith(
      "c1",
      "m1",
      "txt",
      "g1",
      "u1",
      10,
      0.1,
      "mod",
    );
    spy.mockRestore();
  });

  it("should handle API errors", async () => {
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockRejectedValue(new Error("API Fail"));
    await expect(SummarizerService.summarize("content")).rejects.toThrow(
      "API Fail",
    );
    spy.mockRestore();
  });

  it("should return message for empty content", async () => {
    const result = await SummarizerService.summarize("");
    expect(result.summary).toContain("No content");
  });
});
