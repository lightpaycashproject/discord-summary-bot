const { expect, it, describe } = require("bun:test");
const { validateEnv } = require("../src/utils/envValidator");

describe("EnvValidator", () => {
  it("should not throw if all required variables are present", () => {
    const config = {
      discord: { token: "token", clientId: "id" },
      llm: { apiKey: "key" },
      admin: { userId: "admin" },
    };
    expect(() => validateEnv(config)).not.toThrow();
  });

  it("should throw if a required variable is missing", () => {
    const config = {
      discord: { token: null, clientId: "id" },
      llm: { apiKey: "key" },
      admin: { userId: "admin" },
    };
    expect(() => validateEnv(config)).toThrow(
      "Missing required environment variables: DISCORD_TOKEN",
    );
  });

  it("should list all missing variables", () => {
    const config = {
      discord: { token: null, clientId: null },
      llm: { apiKey: null },
      admin: { userId: null },
    };
    expect(() => validateEnv(config)).toThrow(
      "Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, LLM_API_KEY, ADMIN_USER_ID",
    );
  });
});
