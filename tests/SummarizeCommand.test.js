const scraperService = require("../src/services/ScraperService");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

describe("SummarizeCommand", () => {
  let mockInteraction;
  let spies = [];

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
    };
    spies = [];
    jest.clearAllMocks();
  });

  afterEach(() => {
    spies.forEach(s => s.mockRestore());
  });

  it("should deny non-text channels", async () => {
    mockInteraction.channel.isTextBased.mockReturnValue(false);
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("text channels"),
      }),
    );
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
    spies.push(jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue("Cached Result"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalledWith(
      expect.stringContaining("CACHED"),
    );
  });

  it("should generate new summary and handle batching", async () => {
    const msg = (id, text) => ({
      id,
      createdTimestamp: Date.now(),
      author: { bot: false, username: "user" },
      content: text,
    });
    
    // 6 unique URLs to trigger batching (batch size 5)
    const texts = [
        "https://x.com/u/status/1",
        "https://x.com/u/status/2",
        "https://x.com/u/status/3",
        "https://x.com/u/status/4",
        "https://x.com/u/status/5",
        "https://x.com/u/status/6"
    ];

    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map(texts.map((t, i) => [`${i}`, msg(`${i}`, t)])),
    );
    
    spies.push(jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null));
    spies.push(jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue("Tweet Content"));
    spies.push(jest.spyOn(summarizerService, "summarize").mockResolvedValue("Final Summary"));
    spies.push(jest.spyOn(summarizerService, "saveSummary").mockImplementation(() => {}));

    await SummarizeCommand.execute(mockInteraction);

    expect(scraperService.scrapeTweet).toHaveBeenCalledTimes(6);
    expect(summarizerService.summarize).toHaveBeenCalled();
  });

  it("should handle scrape errors in batch", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false, username: "user" },
      content: "https://x.com/u/status/1",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(new Map([["1", msg]]));
    spies.push(jest.spyOn(scraperService, "scrapeTweet").mockRejectedValue(new Error("Fail")));
    spies.push(jest.spyOn(summarizerService, "summarize").mockResolvedValue("Summary"));

    await SummarizeCommand.execute(mockInteraction);
    expect(scraperService.scrapeTweet).toHaveBeenCalled();
  });

  it("should handle DM failures", async () => {
    const msg = {
      id: "1",
      createdTimestamp: Date.now(),
      author: { bot: false },
      content: "hi",
    };
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", msg]]),
    );
    spies.push(jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null));
    mockInteraction.user.send.mockRejectedValue(new Error("DM Blocked"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("check your privacy settings"),
    );
  });

  it("should handle generic errors during execution", async () => {
    mockInteraction.channel.messages.fetch.mockRejectedValue(
      new Error("Discord API Down"),
    );
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("An error occurred"),
    );
  });
});
