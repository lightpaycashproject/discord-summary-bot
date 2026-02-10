const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const SummarizerService = require("../src/services/SummarizerService");
const { silenceConsole } = require("./helpers");

describe("SummarizerService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  it("should call DB for cached summary", () => {
    jest.spyOn(db, "getCachedSummary").mockReturnValue("S");
    expect(SummarizerService.getCachedSummary("c", "m")).toBe("S");
  });

  it("should call SDK and return summary (non-streaming)", async () => {
    const mockRes = {
      choices: [{ message: { content: "Res" } }],
      usage: { t: 10 },
      model: "m",
    };
    jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockRes);
    const result = await SummarizerService.summarize("Content");
    expect(result.summary).toBe("Res");
  });

  it("should handle streaming summary and filter <think> tags", async () => {
    const mockStream = [
      { choices: [{ delta: { content: "H " } }] },
      { choices: [{ delta: { content: "<think>t</think>W" } }] },
    ];
    jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);
    const updates = [];
    const result = await SummarizerService.summarize("C", (t) =>
      updates.push(t),
    );
    expect(result.summary).toBe("H W");
  });

  it("should handle stream with cross-chunk <think> tags", async () => {
    const mockStream = [
      { choices: [{ delta: { content: "S " } }] },
      { choices: [{ delta: { content: "<th" } }] },
      { choices: [{ delta: { content: "ink>t</think>E" } }] },
    ];
    jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);
    const result = await SummarizerService.summarize("C", () => {});
    expect(result.summary).toBe("S E");
  });

  it("should handle stream with unclosed <think> tag", async () => {
    const mockStream = [{ choices: [{ delta: { content: "H <think>t" } }] }];
    jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockReturnValue(mockStream);
    const result = await SummarizerService.summarize("C", () => {});
    expect(result.summary).toBe("H");
  });

  it("should save summary to DB", () => {
    const spy = jest.spyOn(db, "saveSummary").mockImplementation(() => {});
    SummarizerService.saveSummary("c", "m", "t", "g", "u", 10, 0.1, "mod");
    expect(spy).toHaveBeenCalledWith("c", "m", "t", "g", "u", 10, 0.1, "mod");
  });

  it("should handle API errors", async () => {
    jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockRejectedValue(new Error("fail"));
    await expect(SummarizerService.summarize("c")).rejects.toThrow("fail");
  });

  it("should return message for empty content", async () => {
    const result = await SummarizerService.summarize("");
    expect(result.summary).toContain("No content");
  });
});
