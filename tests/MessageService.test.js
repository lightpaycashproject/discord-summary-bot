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

  it("should format standard correctly", () => {
    const dbMsg = { id: "1", username: "u", content: "c", timestamp: 100 };
    expect(MessageService.formatStandard(dbMsg).username).toBe("u");
    const dMsg = {
      id: "2",
      author: { username: "d" },
      content: "c",
      createdTimestamp: 200,
    };
    expect(MessageService.formatStandard(dMsg).username).toBe("d");
  });

  it("should chunk strings and send DMs", async () => {
    const user = { send: jest.fn().mockResolvedValue({}) };
    await MessageService.sendDMChunks(user, "A\nB", "P: ");
    expect(user.send).toHaveBeenCalled();
  });

  it("should handle message logging and scraping", async () => {
    const msg = {
      id: "1",
      channelId: "c",
      guildId: "g",
      author: { id: "u", username: "n", bot: false },
      content: "t",
      createdTimestamp: 1,
    };
    const spySave = jest.spyOn(db, "saveMessage").mockImplementation(() => {});
    const spyScrape = jest
      .spyOn(scraperService, "scrapeAllFromText")
      .mockResolvedValue({});

    await MessageService.handleMessage(msg);
    expect(spySave).toHaveBeenCalled();
    expect(spyScrape).toHaveBeenCalled();
  });

  it("should handle random pruning", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0.05;
    const spyPrune = jest
      .spyOn(db, "pruneMessages")
      .mockImplementation(() => {});
    await MessageService.handleMessage({
      author: { bot: false },
      id: "1",
      content: "",
    });
    expect(spyPrune).toHaveBeenCalled();

    Math.random = () => 0.9;
    spyPrune.mockClear();
    await MessageService.handleMessage({
      author: { bot: false },
      id: "2",
      content: "",
    });
    expect(spyPrune).not.toHaveBeenCalled();

    Math.random = originalRandom;
  });

  it("should catch logging errors explicitly", async () => {
    // Force an error in saveMessage to hit line 28-29
    const spySave = jest.spyOn(db, "saveMessage").mockImplementation(() => {
      throw new Error("force fail");
    });
    const spyErr = jest.spyOn(console, "error").mockImplementation(() => {});

    const msg = {
      id: "X",
      author: { id: "u", username: "n", bot: false },
      content: "",
    };
    await MessageService.handleMessage(msg);

    expect(spyErr).toHaveBeenCalled();
    spySave.mockRestore();
    spyErr.mockRestore();
  });

  it("should catch scraping errors explicitly", async () => {
    jest
      .spyOn(scraperService, "scrapeAllFromText")
      .mockRejectedValue(new Error("fail"));
    await MessageService.handleMessage({ author: { bot: false }, content: "" });
  });

  it("should chunk strings without newlines", () => {
    const chunks = MessageService.chunkString("123456", 2);
    expect(chunks.length).toBe(3);
  });
});
