const { expect, it, describe, beforeEach, jest } = require("bun:test");
const db = require("../src/services/DatabaseService");
const scraperService = require("../src/services/ScraperService");
const MessageService = require("../src/services/MessageService");
const { silenceConsole } = require("./helpers");

describe("MessageService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    silenceConsole();
  });

  it("should ignore bot messages", async () => {
    const spySave = jest.spyOn(db, "saveMessage");
    await MessageService.handleMessage({ author: { bot: true } });
    expect(spySave).not.toHaveBeenCalled();
  });

  it("should log message and scrape links", async () => {
    const msg = {
      id: "1",
      channelId: "c1",
      guildId: "g1",
      author: { id: "u1", username: "user", bot: false },
      content: "check https://x.com/user/status/123",
      createdTimestamp: Date.now(),
    };

    const spySave = jest.spyOn(db, "saveMessage").mockImplementation(() => {});
    const spyScrape = jest.spyOn(scraperService, "scrapeTweet").mockResolvedValue("C");

    await MessageService.handleMessage(msg);

    expect(spySave).toHaveBeenCalledWith(
      "1", "c1", "g1", "u1", "user", msg.content, msg.createdTimestamp
    );
    expect(spyScrape).toHaveBeenCalledWith("https://x.com/user/status/123");
  });

  it("should handle logging errors gracefully", async () => {
    const msg = {
      id: "1",
      channelId: "c1",
      guildId: "g1",
      author: { id: "u1", username: "user", bot: false },
      content: "hi",
      createdTimestamp: Date.now(),
    };

    jest.spyOn(db, "saveMessage").mockImplementation(() => {
      throw new Error("DB fail");
    });

    // Should not throw
    await MessageService.handleMessage(msg);
  });

  it("should handle scraping errors gracefully", async () => {
    const msg = {
      id: "1",
      channelId: "c1",
      guildId: "g1",
      author: { id: "u1", username: "user", bot: false },
      content: "https://x.com/user/status/123",
      createdTimestamp: Date.now(),
    };

    jest.spyOn(db, "saveMessage").mockImplementation(() => {});
    jest.spyOn(scraperService, "scrapeTweet").mockRejectedValue(new Error("Net fail"));

    // Should not throw (async errors in loops are caught and logged)
    await MessageService.handleMessage(msg);
  });
});
