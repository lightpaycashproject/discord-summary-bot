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

describe("SummarizeCommand (Update Interval Branch)", () => {
  let mockInteraction;
  let originalNow;

  beforeEach(() => {
    originalNow = Date.now;

    // Call order inside execute:
    // 1) startTime = Date.now()
    // 2) lastUpdateTime = Date.now()
    // 3) now = Date.now() inside onUpdate callback
    Date.now = jest
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2000)
      .mockReturnValue(2000);

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
                  createdTimestamp: 1000,
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

  it("should execute the update interval branch", async () => {
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

  afterEach(() => {
    Date.now = originalNow;
  });
});
