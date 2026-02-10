/**
 * Validates that all required environment variables are present.
 * Throws an error if any are missing.
 * @param {Object} config - The configuration object to validate.
 */
function validateEnv(config) {
  const required = [
    { key: "DISCORD_TOKEN", value: config.discord.token },
    { key: "CLIENT_ID", value: config.discord.clientId },
    { key: "LLM_API_KEY", value: config.llm.apiKey },
    { key: "ADMIN_USER_ID", value: config.admin.userId },
  ];

  const missing = required
    .filter((item) => !item.value)
    .map((item) => item.key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

module.exports = { validateEnv };
