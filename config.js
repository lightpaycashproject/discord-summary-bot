require('dotenv').config();

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    channelId: process.env.DEFAULT_CHANNEL_ID,
  },
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'nvidia/llama-3.1-405b-instruct',
  },
  scraper: {
    timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 30000,
  },
  summarize: {
    limit: parseInt(process.env.SUMMARIZE_LIMIT) || 100,
  },
  admin: {
    userId: process.env.ADMIN_USER_ID,
  },
  database: {
    path: process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.DATABASE_PATH || 'database.sqlite'),
  },
};
