const { expect, it, describe, beforeEach, jest } = require("bun:test");
const SummarizerService = require("../src/services/SummarizerService");
const db = require("../src/services/DatabaseService");

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
      choices: [
        { message: { content: "<think>Reasoning</think>Final result" } },
      ],
    };
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize("Chat content");
    expect(summary).toBe("Final result");
    spy.mockRestore();
  });

  it("should handle streaming summary and filter <think> tags", async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: "Start " } }] };
      yield { choices: [{ delta: { content: "<think>" } }] };
      yield { choices: [{ delta: { content: "logic" } }] };
      yield { choices: [{ delta: { content: "</think>" } }] };
      yield { choices: [{ delta: { content: "End" } }] };
    })();
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockStream);

    const updates = [];
    const summary = await SummarizerService.summarize("content", (t) =>
      updates.push(t),
    );

    expect(summary).toBe("Start End");
    expect(updates).toContain("Start ");
    spy.mockRestore();
  });

  it("should handle partial <think> tags across chunks", async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: "Text " } }] };
      yield { choices: [{ delta: { content: "<th" } }] };
      yield { choices: [{ delta: { content: "ink>hidden</think>" } }] };
      yield { choices: [{ delta: { content: " more" } }] };
    })();
    const spy = jest
      .spyOn(SummarizerService.openRouter.chat, "send")
      .mockResolvedValue(mockStream);

    const summary = await SummarizerService.summarize("content", () => {});
    expect(summary).toBe("Text  more");
    spy.mockRestore();
  });

  it("should save summary to DB", () => {
    const spy = jest.spyOn(db, "saveSummary").mockImplementation(() => {});
    SummarizerService.saveSummary("chan1", "msg1", "text");
    expect(spy).toHaveBeenCalled();
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
    expect(result).toBe("No content to summarize.");
  });
});
