const { expect, it, describe, beforeEach, jest } = require("bun:test");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

describe("SummarizeCommand (Stream Error)", () => {
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
                  content: "hello",
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

  it("should handle summarize throwing errors", async () => {
    jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null);
    jest
      .spyOn(summarizerService, "summarize")
      .mockRejectedValue(new Error("boom"));

    await SummarizeCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      "An error occurred while generating the summary.",
    );
  });
});
