// Mock DatabaseService BEFORE everything
jest.mock("../src/services/DatabaseService", () => {
  return {
    getCachedSummary: jest.fn(),
    saveSummary: jest.fn(),
    getCachedTweet: jest.fn(),
    saveTweet: jest.fn(),
  };
});

// Mock OpenRouter SDK
const mockSend = jest.fn();
jest.mock("@openrouter/sdk", () => {
  return {
    OpenRouter: jest.fn().mockImplementation(() => {
      return { chat: { send: mockSend } };
    }),
  };
});

const SummarizerService = require("../src/services/SummarizerService");
const db = require("../src/services/DatabaseService");

describe("SummarizerService with Caching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call DB for cached summary", () => {
    db.getCachedSummary.mockReturnValue("Cached summary");
    const result = SummarizerService.getCachedSummary("chan1", "msg1");
    expect(result).toBe("Cached summary");
  });

  it("should call SDK and return summary (non-streaming)", async () => {
    const mockResponse = {
      choices: [
        { message: { content: "<think>Reasoning</think>Final result" } },
      ],
    };
    mockSend.mockResolvedValue(mockResponse);

    const summary = await SummarizerService.summarize("Chat content");
    expect(summary).toBe("Final result");
  });

  it("should handle streaming summary and filter <think> tags", async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: "Start " } }] };
      yield { choices: [{ delta: { content: "<think>" } }] };
      yield { choices: [{ delta: { content: "logic" } }] };
      yield { choices: [{ delta: { content: "</think>" } }] };
      yield { choices: [{ delta: { content: "End" } }] };
    })();
    mockSend.mockResolvedValue(mockStream);

    const updates = [];
    const summary = await SummarizerService.summarize("content", (t) =>
      updates.push(t),
    );

    expect(summary).toBe("Start End");
    expect(updates).toContain("Start ");
    expect(updates[updates.length - 1]).toBe("Start End");
  });

  it("should handle partial <think> tags across chunks", async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: "Text " } }] };
      yield { choices: [{ delta: { content: "<th" } }] };
      yield { choices: [{ delta: { content: "ink>hidden</think>" } }] };
      yield { choices: [{ delta: { content: " more" } }] };
    })();
    mockSend.mockResolvedValue(mockStream);

    const summary = await SummarizerService.summarize("content", () => {});
    expect(summary).toBe("Text  more");
  });

  it("should save summary to DB", () => {
    SummarizerService.saveSummary("chan1", "msg1", "text");
    expect(db.saveSummary).toHaveBeenCalledWith("chan1", "msg1", "text");
  });

  it("should handle API errors", async () => {
    mockSend.mockRejectedValue(new Error("API Fail"));
    const summary = await SummarizerService.summarize("content");
    expect(summary).toBe("Failed to generate summary due to an API error.");
  });
});
