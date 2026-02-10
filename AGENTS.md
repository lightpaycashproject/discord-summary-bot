# AGENTS.md - Developer Guide for AI Agents

Welcome, fellow agent. This project is a specialized Discord bot for summarizing conversations and unrolling X (Twitter) threads. It is built to run exclusively on **Bun**.

## 🚀 Core Philosophy
- **Bun-Native**: No Node.js dependencies where a Bun native equivalent exists (e.g., `bun:sqlite` instead of `better-sqlite3`, native `fetch`, `bun test`).
- **Real-Time Streaming**: Summaries are streamed to user DMs using OpenRouter to provide immediate feedback.
- **Privacy First**: Summaries are delivered via DM to avoid cluttering public channels and respect conversation context.
- **Intents & Permissions**: Requires `GuildMessages`, `MessageContent`, and `DirectMessages` intents. `Partials.Channel` and `Partials.Message` are enabled for reliable DM handling.

## 🏗 Project Structure

```text
├── src/
│   ├── index.js                # Bot entry point & event handlers
│   ├── commands/               # Slash command definitions
│   │   ├── SummarizeCommand.js # Main /summarize logic
│   │   └── AdminCommand.js     # /admin (stats, clear-cache)
│   └── services/               # Logic & External API wrappers
│       ├── DatabaseService.js  # Persistence (bun:sqlite)
│       ├── ScraperService.js   # X.com scraping via fxtwitter
│       └── SummarizerService.js# LLM logic via OpenRouter SDK
├── tests/                      # Comprehensive Bun test suite
├── config.js                   # Environment variable mapping
└── deploy-commands.js          # Slash command registration script
```

## 🛠 Key Services

### 1. ScraperService (`fxtwitter`)
- **JSON API**: Uses `https://api.fxtwitter.com/...` to get structured tweet data.
- **Thread Unrolling**: Recursively follows `replying_to_status` IDs (up to 10 deep) to reconstruct full threads.
- **Media Support**: Extracts media URLs (images/videos) and quoted tweet context.
- **Caching**: All scraped tweets are stored in `scraped_data` table to avoid redundant API calls and rate limits.

### 2. SummarizerService (`OpenRouter`)
- **Streaming**: Uses the `@openrouter/sdk` streaming capability.
- **Cleaning**: Automatically filters out `<think>` reasoning tags from AI models (like DeepSeek/Gemini) before showing text to the user.
- **Database Caching**: Summaries are cached by `channel_id` + `last_message_id`. If the conversation hasn't changed, the bot returns the cached version instantly.

### 3. DatabaseService (`bun:sqlite`)
- Uses a local `database.sqlite` file.
- **Schema**:
    - `scraped_data`: `url`, `content`, `timestamp`.
    - `summaries`: `channel_id`, `last_message_id`, `summary_text`, `timestamp`.

## 🧪 Testing Standards
- Run tests via `bun test`.
- **Integration**: Real network calls are included in `tests/ScraperService.test.js` to ensure the X scraper works with live data.
- **Mocks/Spies**: Use `jest.spyOn()` to mock singleton services. Always use `spy.mockRestore()` in `afterEach` to prevent state leakage.

## 🤖 Interaction for Agents
If you are modifying this codebase:
1. **Never add `axios` or `jest`**: Use `fetch` and `bun:test`.
2. **Handle DMs**: The bot primarily communicates via `interaction.user.send()`. Always check for "DM Blocked" errors.
3. **Admin Rights**: Only `ADMIN_USER_ID` defined in `.env` can run `/admin` commands.
4. **Linting**: Ensure `bun run lint` passes before pushing. The project uses ESLint v10 (Flat Config) and Prettier.

---
*Maintained by Antigravity (Advanced Agentic Coding).*
