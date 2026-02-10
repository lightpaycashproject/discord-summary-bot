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
  let mockDM;
  let originalNow;

  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
    const { interaction, dmMessage } = createMockInteraction();
    mockInteraction = interaction;
    mockDM = dmMessage;
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

  it("should use cached summary if available", async () => {
    const msg = createMockMessage("1", Date.now());
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    jest
      .spyOn(summarizerService, "getCachedSummary")
      .mockReturnValue("Cached Result");

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalled();
  });

  it("should use recent summary within TTL if perfect match fails", async () => {
    const msg = createMockMessage("2", Date.now());
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["2", msg]]),
    );

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest
      .spyOn(dbService, "getRecentSummary")
      .mockReturnValue("Recent TTL Summary");

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalledWith(
      expect.stringContaining("[FRESH]"),
    );
  });

  it("should use local message log if available", async () => {
    const localMsgs = [
      { id: "1", username: "u1", content: "Local", timestamp: Date.now() },
    ];
    dbService.getMessages.mockReturnValue(localMsgs);

    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "Local Sum",
      usage: { total_tokens: 5, total_cost: 0.001 },
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalledWith(
      expect.stringContaining("Using local message log"),
    );
  });

  it("should mention local log in cached reply", async () => {
    dbService.getMessages.mockReturnValue([
      { id: "1", username: "u", content: "c", timestamp: Date.now() },
    ]);
    jest
      .spyOn(summarizerService, "getCachedSummary")
      .mockReturnValue("Cached Result");

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("from local log"),
    );
  });

  it("should handle cached summary DM failure", async () => {
    const msg = createMockMessage("1", Date.now());
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    jest
      .spyOn(summarizerService, "getCachedSummary")
      .mockReturnValue("Cached Result");
    mockInteraction.user.send.mockRejectedValue(new Error("Fail"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("could not DM you"),
    );
  });

  it("should generate new summary and handle batching and streaming", async () => {
    const msg1 = createMockMessage("1", Date.now(), "https://x.com/u/status/1");
    const msg2 = createMockMessage("2", Date.now(), "https://x.com/u/status/2");
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        ["1", msg1],
        ["2", msg2],
      ]),
    );

    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockResolvedValue("Tweet Content");
    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest
            .fn()
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(2000)
            .mockReturnValueOnce(2000);
          await cb("Update");
          Date.now = original;
        }
        return {
          summary: "Final",
          usage: { total_tokens: 10, total_cost: 0.1 },
          model: "m",
        };
      });

    await SummarizeCommand.execute(mockInteraction);
    expect(scraperService.scrapeTweet).toHaveBeenCalled();
    expect(mockDM.edit).toHaveBeenCalled();
  });

  it("should handle streaming edit failures", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    mockDM.edit.mockRejectedValue(new Error("fail"));

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (t, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValue(2000);
          await cb("test");
          Date.now = original;
        }
        return { summary: "sum", usage: {}, model: "m" };
      });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockDM.edit).toHaveBeenCalled();
  });

  it("should handle initial DM failure", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    mockInteraction.user.send.mockRejectedValue(new Error("Fail"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("check your privacy settings"),
    );
  });

  it("should handle summarize throwing errors", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest
      .spyOn(summarizerService, "summarize")
      .mockRejectedValue(new Error("boom"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      "An error occurred while generating the summary.",
    );
  });

  it("should ignore empty scrape results", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now(), "https://x.com/1")]]),
    );
    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "s",
      usage: { total_tokens: 1 },
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should log and continue when scrape fails", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now(), "https://x.com/1")]]),
    );
    jest.spyOn(scraperService, "scrapeTweet").mockRejectedValue(new Error("e"));
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "s",
      usage: { total_tokens: 1 },
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should stop when allMessages > 10000", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow());

    const batch = new Map();
    for (let i = 0; i < 101; i++) {
      batch.set(String(i), createMockMessage(String(i), Date.now()));
    }
    mockInteraction.channel.messages.fetch = jest.fn().mockResolvedValue(batch);

    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "s",
      usage: { total_tokens: 1 },
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.channel.messages.fetch).toHaveBeenCalled();
  });

  it("should stop when passing the 24h cutoff", async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", old)]]),
    );

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("No conversation found"),
    );
  });

  it("should skip DM edit when update interval not reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
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

  it("should execute the update interval branch", async () => {
    originalNow = Date.now;
    Date.now = jest
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2000)
      .mockReturnValue(2000);

    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", 1000)]]),
    );

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) await cb("update");
        return { summary: "s", usage: {}, model: "m" };
      });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalled();
  });

  it("should update DM when interval reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(2000);
          await cb("update");
          Date.now = original;
        }
        return { summary: "s", usage: {}, model: "m" };
      });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should fallback to word-count tokens if usage missing", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now(), "hello world")]]),
    );
    const saveSpy = dbService.saveSummary;

    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "final summary",
      usage: null,
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(saveSpy).toHaveBeenCalled();
    const args = saveSpy.mock.calls[0];
    expect(args[5]).toBeGreaterThan(0);
  });

  it("should hit DM stream edit error branch", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    mockDM.edit.mockRejectedValue(new Error("fail"));

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValue(2000);
          await cb("update");
          Date.now = original;
        }
        return { summary: "s", usage: {}, model: "m" };
      });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should hit DM edit catch inside update interval branch", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValueOnce(0);

    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    mockDM.edit.mockRejectedValue(new Error("x"));

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
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
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        ["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")],
      ]),
    );
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockResolvedValue("[Error: Failed]");
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "Done",
      usage: { total_tokens: 10, total_cost: 0.1 },
      model: "gpt-4",
    });

    await SummarizeCommand.execute(mockInteraction);
    const sendCall = mockInteraction.user.send.mock.calls.find((c) =>
      c[0].includes("could not be fully scraped"),
    );
    expect(sendCall).toBeDefined();
  });

  it("should handle scrape exceptions in the batch", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        ["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")],
      ]),
    );
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockRejectedValue(new Error("Net"));
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "Done",
      usage: { total_tokens: 10, total_cost: 0.1 },
      model: "gpt-4",
    });

    await SummarizeCommand.execute(mockInteraction);
    const sendCall = mockInteraction.user.send.mock.calls.find((c) =>
      c[0].includes("could not be fully scraped"),
    );
    expect(sendCall).toBeDefined();
  });
});
