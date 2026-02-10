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

describe("SummarizeCommand (Stream Edit Fail Coverage 2)", () => {
  let mockInteraction;
  let originalNow;

  beforeEach(() => {
    originalNow = Date.now;
    Date.now = jest.fn().mockReturnValueOnce(0); // for lastUpdateTime

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
        send: jest.fn().mockResolvedValue({
          edit: jest.fn().mockRejectedValue(new Error("x")),
        }),
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
      guildId: "g1",
    };
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should hit DM edit catch inside update interval branch", async () => {
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

  afterEach(() => {
    Date.now = originalNow;
  });
});
