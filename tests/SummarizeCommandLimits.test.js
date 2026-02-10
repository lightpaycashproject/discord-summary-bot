const {
  expect,
  it,
  describe,
  beforeEach,
  afterEach,
  jest,
} = require("bun:test");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

function makeMessage(id, ts, content = "msg") {
  return {
    id,
    createdTimestamp: ts,
    author: { bot: false, username: "user" },
    content,
  };
}

describe("SummarizeCommand (Loop Limits)", () => {
  let mockInteraction;
  let originalNow;

  beforeEach(() => {
    const now = Date.now();
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(now);

    mockInteraction = {
      channel: {
        isTextBased: jest.fn().mockReturnValue(true),
        name: "general",
        id: "chan123",
        messages: {
          fetch: jest.fn(),
        },
      },
      user: {
        send: jest.fn().mockResolvedValue({ edit: jest.fn() }),
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
      guildId: "g1",
    };

    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should stop when allMessages > 10000", async () => {
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

    // The loop should break once it hits the 10k guard, not infinite
    expect(mockInteraction.channel.messages.fetch).toHaveBeenCalled();
  });

  it("should stop when passing the 24h cutoff", async () => {
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

  afterEach(() => {
    Date.now = originalNow;
  });
});
