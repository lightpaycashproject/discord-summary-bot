const { expect, it, describe, beforeEach, jest } = require("bun:test");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

describe("SummarizeCommand (Update Interval Skip)", () => {
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
                  content: "hi",
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

  it("should skip update if interval not reached", async () => {
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);

    jest
      .spyOn(summarizerService, "summarize")
      .mockImplementation(async (text, cb) => {
        if (cb) {
          const originalNow = Date.now;
          Date.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
          await cb("update");
          Date.now = originalNow;
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
});
