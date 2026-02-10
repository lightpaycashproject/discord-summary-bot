const {
  expect,
  it,
  describe,
  beforeEach,
  afterEach,
  jest,
} = require("bun:test");
const scraperService = require("../src/services/ScraperService");
const summarizerService = require("../src/services/SummarizerService");
const dbService = require("../src/services/DatabaseService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");
const {
  createMockInteraction,
  createMockMessage,
  silenceConsole,
} = require("./helpers");

describe("SummarizeCommand", () => {
  let mockInteraction;
  let mockStatusMsg;
  let originalNow;

  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
    const { interaction } = createMockInteraction();
    mockInteraction = interaction;
    mockStatusMsg = { edit: jest.fn().mockResolvedValue({}) };
    mockInteraction.editReply.mockResolvedValue(mockStatusMsg);
    mockInteraction.followUp = jest.fn().mockResolvedValue({});
    
    jest.spyOn(dbService, "getRecentSummary").mockReturnValue(null);
    jest.spyOn(dbService, "getMessages").mockReturnValue([]);
    jest.spyOn(dbService, "saveSummary").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNow) Date.now = originalNow;
    originalNow = undefined;
  });

  it("should deny non-text channels", async () => {
    mockInteraction.channel.isTextBased.mockReturnValue(false);
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle no messages in 24h", async () => {
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("No conversation found"),
    );
  });

  it("should use cached summary if available and chunk it", async () => {
    const msg = createMockMessage("1", Date.now());
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", msg]]));
    
    const longSummary = "A".repeat(2500);
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(longSummary);

    await SummarizeCommand.execute(mockInteraction);
    
    expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("[FRESH]"));
    expect(mockInteraction.followUp).toHaveBeenCalled();
  });

  it("should use recent summary within TTL if perfect match fails", async () => {
    const msg = createMockMessage("2", Date.now());
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["2", msg]]));

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest.spyOn(dbService, "getRecentSummary").mockReturnValue("Recent TTL Summary");

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("[FRESH]"));
  });

  it("should use local message log if available", async () => {
    dbService.getMessages.mockReturnValue([{ id: "1", username: "u1", content: "L", timestamp: Date.now() }]);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "S", usage: { total_tokens: 5 }, model: "m"
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("Using local message log"));
  });

  it("should generate new summary and handle batching and streaming", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([
      ["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")],
    ]));

    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue("C");
    jest.spyOn(summarizerService, "summarize").mockImplementation(async (text, cb) => {
      if (cb) {
        const original = Date.now;
        Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(2000).mockReturnValueOnce(2000);
        await cb("U");
        Date.now = original;
      }
      return { summary: "Final", usage: { total_tokens: 10 }, model: "m" };
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockStatusMsg.edit).toHaveBeenCalled();
  });

  it("should handle streaming edit failures", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now())]]));
    mockStatusMsg.edit.mockRejectedValue(new Error("fail"));

    jest.spyOn(summarizerService, "summarize").mockImplementation(async (t, cb) => {
      if (cb) {
        const original = Date.now;
        Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValue(2000);
        await cb("test");
        Date.now = original;
      }
      return { summary: "sum", usage: {}, model: "m" };
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockStatusMsg.edit).toHaveBeenCalled();
  });

  it("should chunk very long summaries in final delivery", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now())]]));
    const longSummary = "S".repeat(2500);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: longSummary, usage: { total_tokens: 10 }, model: "m"
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.followUp).toHaveBeenCalled();
  });

  it("should handle summarize throwing errors", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now())]]));
    jest.spyOn(summarizerService, "summarize").mockRejectedValue(new Error("boom"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("An error occurred"));
  });

  it("should ignore empty scrape results", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now(), "https://x.com/1")]]));
    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({ summary: "s", usage: { total_tokens: 1 }, model: "m" });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should stop when allMessages > 10000", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow());
    const batch = new Map();
    for (let i = 0; i < 101; i++) batch.set(String(i), createMockMessage(String(i), Date.now()));
    mockInteraction.channel.messages.fetch = jest.fn().mockResolvedValue(batch);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({ summary: "s", usage: { total_tokens: 1 }, model: "m" });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.channel.messages.fetch).toHaveBeenCalled();
  });

  it("should skip status update if interval not reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now())]]));
    jest.spyOn(summarizerService, "summarize").mockImplementation(async (text, cb) => {
      if (cb) {
        const original = Date.now;
        Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
        await cb("update");
        Date.now = original;
      }
      return { summary: "s", usage: {}, model: "m" };
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should hit status message edit catch inside update interval branch", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValueOnce(0);
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now())]]));
    mockStatusMsg.edit.mockRejectedValue(new Error("x"));

    jest.spyOn(summarizerService, "summarize").mockImplementation(async (text, cb) => {
      if (cb) {
        Date.now = jest.fn().mockReturnValueOnce(2000);
        await cb("update");
      }
      return { summary: "s", usage: {}, model: "m" };
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should handle scrape failures and show warning in status", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")]]));
    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue("[Error: Failed]");
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({ summary: "Done", usage: { total_tokens: 10 }, model: "gpt-4" });

    await SummarizeCommand.execute(mockInteraction);
    const call = mockInteraction.editReply.mock.calls.find(c => c[0] && c[0].includes("could not be fully scraped"));
    expect(call).toBeDefined();
  });

  it("should handle scrape exceptions in the batch", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")]]));
    jest.spyOn(scraperService, "scrapeTweet").mockRejectedValue(new Error("Net"));
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({ summary: "Done", usage: { total_tokens: 10 }, model: "gpt-4" });

    await SummarizeCommand.execute(mockInteraction);
    const call = mockInteraction.editReply.mock.calls.find(c => c[0] && c[0].includes("could not be fully scraped"));
    expect(call).toBeDefined();
  });

  describe("chunkString Utility", () => {
    it("should split string at newlines", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const chunks = SummarizeCommand.chunkString(text, 10);
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toBe("Line 1");
    });

    it("should split at maxLength if no newline found", () => {
      const text = "1234567890ABCDE";
      const chunks = SummarizeCommand.chunkString(text, 10);
      expect(chunks[0]).toBe("1234567890");
    });
  });
  
  describe("StreamUpdateHelper edge cases", () => {
    it("should truncate very long displayBody during stream", async () => {
      const helper = new SummarizeCommand.StreamUpdateHelper(mockStatusMsg, "chan");
      const longText = "A".repeat(2000);
      await helper.updateStatus(longText);
      const editArg = mockStatusMsg.edit.mock.calls[0][0];
      expect(editArg.length).toBeLessThan(2000);
      expect(editArg).toContain("...");
    });
  });
});
