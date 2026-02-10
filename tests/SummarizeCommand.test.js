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

describe("SummarizeCommand", () => {
  let mockInteraction;
  let spies = [];
  let originalNow;

  const makeMessage = (id, ts, content = "msg") => ({
    id,
    createdTimestamp: ts,
    author: { bot: false, username: "user" },
    content,
  });

  beforeEach(() => {
    mockInteraction = {
      channel: {
        isTextBased: jest.fn().mockReturnValue(true),
        name: "general",
        id: "chan123",
        messages: {
          fetch: jest.fn().mockResolvedValue(new Map()),
        },
      },
      user: {
        send: jest.fn().mockResolvedValue({ edit: jest.fn() }),
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
      guildId: "guild123",
    };
    spies = [];
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(dbService, "getRecentSummary").mockReturnValue(null);
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    if (originalNow) Date.now = originalNow;
    originalNow = undefined;
  });

  it("should deny non-text channels", async () => {
    mockInteraction.channel.isTextBased.mockReturnValue(false);
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle no messages in 24h", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map());
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("No conversation found"),
    );
  });

  it("should use cached summary if available", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    spies.push(
      jest
        .spyOn(summarizerService, "getCachedSummary")
        .mockReturnValue("Cached Result"),
    );

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalled();
  });

  it("should use recent summary within TTL if perfect match fails", async () => {
    const msg = {
      id: "2",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["2", msg]]),
    );

    // Perfect match returns null
    spies.push(
      jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null),
    );
    // Recent TTL match returns a summary
    spies.push(
      jest
        .spyOn(dbService, "getRecentSummary")
        .mockReturnValue("Recent TTL Summary"),
    );

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.user.send).toHaveBeenCalledWith(
      expect.stringContaining("[FRESH]"),
    );
  });

  it("should handle cached summary DM failure", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    spies.push(
      jest
        .spyOn(summarizerService, "getCachedSummary")
        .mockReturnValue("Cached Result"),
    );
    mockInteraction.user.send.mockRejectedValue(new Error("DM Blocked"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("could not DM you"),
    );
  });

  it("should generate new summary and handle batching and streaming", async () => {
    const msg = (id, text) => ({
      id,
      createdTimestamp: Date.now(),
      author: { bot: false, username: "user" },
      content: text,
    });

    const texts = ["https://x.com/u/status/1", "https://x.com/u/status/2"];
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map(texts.map((t, i) => [`${i}`, msg(`${i}`, t)])),
    );

    const mockDM = { edit: jest.fn() };
    mockInteraction.user.send.mockResolvedValue(mockDM);

    spies.push(
      jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null),
    );
    spies.push(
      jest
        .spyOn(scraperService, "scrapeTweet")
        .mockResolvedValue("Tweet Content"),
    );
    spies.push(
      jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {}),
    );

    // Mock summarizer.summarize to trigger the stream callback
    spies.push(
      jest
        .spyOn(summarizerService, "summarize")
        .mockImplementation(async (text, cb) => {
          if (cb) {
            const original = Date.now;
            Date.now = jest
              .fn()
              .mockReturnValueOnce(0) // initial lastUpdateTime
              .mockReturnValueOnce(2000) // first cb call (2000 - 0 > 1500)
              .mockReturnValueOnce(2000); // updating lastUpdateTime

            await cb("Live Update");
            Date.now = original;
          }
          return {
            summary: "Final Summary",
            usage: { total_tokens: 10, total_cost: 0.01 },
            model: "test-model",
          };
        }),
    );

    await SummarizeCommand.execute(mockInteraction);

    expect(scraperService.scrapeTweet).toHaveBeenCalled();
    expect(mockDM.edit).toHaveBeenCalled();
  });

  it("should handle streaming edit failures", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    const mockDM = { edit: jest.fn().mockRejectedValue(new Error("fail")) };
    mockInteraction.user.send.mockResolvedValue(mockDM);

    spies.push(
      jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null),
    );
    spies.push(
      jest
        .spyOn(summarizerService, "summarize")
        .mockImplementation(async (t, cb) => {
          if (cb) {
            const original = Date.now;
            Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValue(2000);
            await cb("test");
            Date.now = original;
          }
          return { summary: "summary", usage: {}, model: "m" };
        }),
    );

    await SummarizeCommand.execute(mockInteraction);
    expect(mockDM.edit).toHaveBeenCalled();
  });

  it("should handle initial DM failure", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    spies.push(
      jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null),
    );
    mockInteraction.user.send.mockRejectedValue(new Error("DM Fail"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("check your privacy settings"),
    );
  });

  it("should handle summarize throwing errors", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hello",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
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
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "https://x.com/u/status/1",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "sum",
      usage: { total_tokens: 1, total_cost: 0.001 },
      model: "m",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should log and continue when scrape fails", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "https://x.com/u/status/1",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockRejectedValue(new Error("scrape fail"));
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "sum",
      usage: { total_tokens: 1, total_cost: 0.001 },
      model: "m",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should stop when allMessages > 10000", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow());

    const now = Date.now();
    const batch = new Map();
    for (let i = 0; i < 101; i++) {
      batch.set(String(i), makeMessage(String(i), now, "hello"));
    }

    // Force 101 batches -> 101 * 101 > 10000
    mockInteraction.channel.messages.fetch = jest.fn().mockResolvedValue(batch);

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "sum",
      usage: { total_tokens: 1, total_cost: 0.001 },
      model: "m",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.channel.messages.fetch).toHaveBeenCalled();
  });

  it("should stop when passing the 24h cutoff", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow());

    const now = Date.now();
    const old = now - 25 * 60 * 60 * 1000; // older than 24h
    const batch = new Map([["1", makeMessage("1", old, "old")]]);

    mockInteraction.channel.messages.fetch = jest.fn().mockResolvedValue(batch);

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "sum",
      usage: { total_tokens: 1, total_cost: 0.001 },
      model: "m",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      "No conversation found in the last 24 hours to summarize.",
    );
  });

  it("should skip DM edit when update interval not reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
          await cb("update");
          Date.now = original;
        }
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

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
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: 1000,
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) await cb("update");
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.user.send).toHaveBeenCalled();
  });

  it("should update DM when interval reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest
            .fn()
            .mockReturnValueOnce(0) // lastUpdateTime
            .mockReturnValueOnce(2000); // now
          await cb("update");
          Date.now = original;
        }
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should skip update if interval not reached", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
          await cb("update");
          Date.now = original;
        }
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should fallback to word-count tokens if usage missing", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hello",
          },
        ],
      ]),
    );
    const saveSpy = jest
      .spyOn(summarizerService, "saveSummary")
      .mockImplementation(() => {});

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "final summary",
      usage: null,
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);

    expect(saveSpy).toHaveBeenCalled();
    const args = saveSpy.mock.calls[0];
    expect(args[5]).toBeGreaterThan(0); // token fallback
  });

  it("should hit DM stream edit error branch", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );
    mockInteraction.user.send.mockResolvedValue({
      edit: jest.fn().mockRejectedValue(new Error("fail")),
    });

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const original = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValue(2000);
          await cb("update");
          Date.now = original;
        }
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should hit DM edit catch inside update interval branch", async () => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValueOnce(0); // for lastUpdateTime

    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "hi",
          },
        ],
      ]),
    );
    mockInteraction.user.send.mockResolvedValue({
      edit: jest.fn().mockRejectedValue(new Error("x")),
    });

    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          Date.now = jest.fn().mockReturnValueOnce(2000);
          await cb("update");
        }
        return {
          summary: "sum",
          usage: { total_tokens: 1, total_cost: 0.001 },
          model: "m",
        };
      });

    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
  });

  it("should handle scrape failures and show warning in status", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "https://x.com/u/status/1",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockResolvedValue("[Error: Failed]");
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "Done",
      usage: { total_tokens: 10, total_cost: 0.1 },
      model: "gpt-4",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    const sendCall = mockInteraction.user.send.mock.calls.find((c) =>
      c[0].includes("could not be fully scraped"),
    );
    expect(sendCall).toBeDefined();
  });

  it("should handle scrape exceptions in the batch", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        [
          "1",
          {
            id: "1",
            createdTimestamp: Date.now(),
            author: { bot: false, username: "user" },
            content: "https://x.com/u/status/1",
          },
        ],
      ]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest
      .spyOn(scraperService, "scrapeTweet")
      .mockRejectedValue(new Error("Network Error"));
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "Done",
      usage: { total_tokens: 10, total_cost: 0.1 },
      model: "gpt-4",
    });
    jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {});

    await SummarizeCommand.execute(mockInteraction);

    const sendCall = mockInteraction.user.send.mock.calls.find((c) =>
      c[0].includes("could not be fully scraped"),
    );
    expect(sendCall).toBeDefined();
  });
});
