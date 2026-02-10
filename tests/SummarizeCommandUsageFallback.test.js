const { expect, it, describe, beforeEach, jest } = require("bun:test");
const summarizerService = require("../src/services/SummarizerService");
const SummarizeCommand = require("../src/commands/SummarizeCommand");

describe("SummarizeCommand (Usage Fallback)", () => {
  let mockInteraction;
  let spies = [];

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
    spies = [];
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should fallback to word-count tokens if usage missing", async () => {
    spies.push(
      jest.spyOn(summarizerService, "getCachedSummary").mockReturnValue(null),
    );

    const saveSpy = jest
      .spyOn(summarizerService, "saveSummary")
      .mockImplementation(() => {});

    spies.push(
      jest.spyOn(summarizerService, "summarize").mockResolvedValue({
        summary: "final summary",
        usage: null,
        model: "m",
      }),
    );

    await SummarizeCommand.execute(mockInteraction);

    expect(saveSpy).toHaveBeenCalled();
    const args = saveSpy.mock.calls[0];
    expect(args[5]).toBeGreaterThan(0); // token fallback
  });
});
