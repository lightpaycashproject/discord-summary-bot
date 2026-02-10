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
const messageService = require("../src/services/MessageService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");
const {
  createMockInteraction,
  createMockMessage,
  silenceConsole,
} = require("./helpers");

describe("SummarizeCommand", () => {
  let mockInteraction, mockDM;

  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
    const { interaction, dmMessage } = createMockInteraction();
    mockInteraction = interaction;
    mockDM = dmMessage;
    mockDM.delete = jest.fn().mockResolvedValue({});

    jest.spyOn(dbService, "getRecentSummary").mockReturnValue(null);
    jest.spyOn(dbService, "getMessages").mockReturnValue([]);
    jest.spyOn(dbService, "saveSummary").mockImplementation(() => {});
  });

  afterEach(() => {
    // kept for symmetry / future hooks
  });

  it("should deny non-text channels", async () => {
    mockInteraction.channel.isTextBased.mockReturnValue(false);
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalled();
  });

  it("should handle no messages", async () => {
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("No conversation"),
    );
  });

  it("should use cached summary", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue("Cached");
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Sent the summary"),
    );
  });

  it("should handle cached summary DM failure", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue("C");
    jest
      .spyOn(messageService, "sendDMChunks")
      .mockRejectedValue(new Error("fail"));

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("could not DM you"),
    );
  });

  it("should generate new summary with scraping", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([
        ["1", createMockMessage("1", Date.now(), "https://x.com/u/status/1")],
      ]),
    );
    jest.spyOn(scraperService, "scrapeAllFromText").mockResolvedValue({
      contextMap: new Map([["https://x.com/u/status/1", "C"]]),
      failures: 1,
    });
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "S",
      usage: { total_tokens: 1 },
      model: "m",
    });

    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.user.send).toHaveBeenCalled();
    expect(mockDM.delete).toHaveBeenCalled();
  });

  it("should handle summarize error", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest
      .spyOn(summarizerService, "summarize")
      .mockRejectedValue(new Error("boom"));
    mockInteraction.deferred = true;
    await SummarizeCommand.execute(mockInteraction);
    const lastCall =
      mockInteraction.editReply.mock.calls[
        mockInteraction.editReply.mock.calls.length - 1
      ][0];
    expect(lastCall.content || lastCall).toContain("An error occurred");
  });

  it("should handle summarize with stream callback", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) await cb("test update");
        return { summary: "final", usage: {}, model: "m" };
      });
    await SummarizeCommand.execute(mockInteraction);
    expect(summarizerService.summarize).toHaveBeenCalled();
  });

  it("should handle API fetch and map local format", async () => {
    mockInteraction.channel.messages.fetch.mockResolvedValue(
      new Map([["1", createMockMessage("1", Date.now())]]),
    );
    jest.spyOn(summarizerService, "summarize").mockResolvedValue({
      summary: "S",
      usage: { total_tokens: 1 },
      model: "m",
    });
    await SummarizeCommand.execute(mockInteraction);
    expect(summarizerService.summarize).toHaveBeenCalled();
  });

  it("should stop if messages > 10000", async () => {
    const batch = new Map();
    for (let i = 0; i < 101; i++)
      batch.set(String(i), createMockMessage(String(i), Date.now()));
    mockInteraction.channel.messages.fetch = jest.fn().mockResolvedValue(batch);
    jest
      .spyOn(summarizerService, "summarize")
      .mockResolvedValue({ summary: "s" });
    await SummarizeCommand.execute(mockInteraction);
    expect(mockInteraction.channel.messages.fetch).toHaveBeenCalled();
  });

  describe("StreamUpdateHelper", () => {
    it("should construct correctly", () => {
      const helper = new SummarizeCommand.StreamUpdateHelper(mockDM, "c", 2000);
      expect(helper.channelName).toBe("c");
      expect(helper.updateInterval).toBe(2000);
    });

    it("should truncate long stream text", async () => {
      const helper = new SummarizeCommand.StreamUpdateHelper(mockDM, "c");
      await helper.updateStatus("A".repeat(2000));
      expect(mockDM.edit).toHaveBeenCalledWith(expect.stringContaining("..."));
    });

    it("should skip update if interval not reached", async () => {
      const helper = new SummarizeCommand.StreamUpdateHelper(mockDM, "c", 1000);
      await helper.maybeUpdate("1");
      await helper.maybeUpdate("2");
      expect(mockDM.edit).not.toHaveBeenCalled();
    });

    it("should handle edit errors in StreamUpdateHelper", async () => {
      const helper = new SummarizeCommand.StreamUpdateHelper(mockDM, "c", 1);
      mockDM.edit.mockRejectedValue(new Error("fail"));
      await helper.maybeUpdate("1");
      await new Promise((r) => setTimeout(r, 5));
      await helper.maybeUpdate("2");
      expect(mockDM.edit).toHaveBeenCalled();
    });
  });
});
