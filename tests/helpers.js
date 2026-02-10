const { jest } = require("bun:test");

/**
 * Creates a standard mock Discord interaction object.
 * @param {Object} overrides - Overrides for the mock object.
 * @returns {Object}
 */
function createMockInteraction(overrides = {}) {
  const dmMessage = { edit: jest.fn().mockResolvedValue({}) };
  const interaction = {
    channel: {
      isTextBased: jest.fn().mockReturnValue(true),
      name: "general",
      id: "chan123",
      messages: {
        fetch: jest.fn().mockResolvedValue(new Map()),
      },
    },
    user: {
      id: "user123",
      username: "testuser",
      send: jest.fn().mockResolvedValue(dmMessage),
    },
    deferReply: jest.fn().mockResolvedValue({}),
    editReply: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    guildId: "guild123",
    commandName: "test",
    isCommand: () => true,
    ...overrides,
  };
  return { interaction, dmMessage };
}

/**
 * Creates a mock Discord message.
 */
function createMockMessage(id, ts, content = "msg", username = "user") {
  return {
    id,
    createdTimestamp: ts,
    author: { bot: false, username, id: `u${id}` },
    content,
  };
}

/**
 * Silences common console outputs during tests.
 */
function silenceConsole() {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
}

module.exports = {
  createMockInteraction,
  createMockMessage,
  silenceConsole,
};
