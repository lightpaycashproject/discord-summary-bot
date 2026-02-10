const { expect, it, describe, beforeEach, jest } = require("bun:test");
const scraperService = require("../src/services/ScraperService");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

describe("SummarizeCommand (Scrape Error)", () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      channel: {
        isTextBased: jest.fn().mockReturnValue(true),
        name: "general",
        id: "chan123",
        messages: {
          fetch: jest.fn().mockResolvedValue(
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
          ),
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

  it("should log and continue when scrape fails", async () => {
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
});
