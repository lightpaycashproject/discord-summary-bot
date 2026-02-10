# Discord Summary Bot

A Discord bot that summarizes conversations in a text channel using AI (NVIDIA API / OpenRouter) and scrapes context from X.com links.

## Features

- **Summarize Conversations**: Use `/summarize` to get a concise summary of the last 50 messages in the channel.
- **X.com Scraping**: Automatically fetches and unrolls X.com / Twitter threads, including quoted tweets, using the FixTweet API (no browser required).
- **Direct Message Delivery**: The summary is sent directly to your DMs to avoid cluttering the channel.
- **Smart Caching**: Local SQLite database caches X.com scraping results and generated summaries. If the conversation hasn't changed, the bot serves the cached summary to save API tokens.
- **24-Hour Window**: Automatically fetches and summarizes the last 24 hours of conversation history.

## Prerequisites

- Node.js (v18+)
- Discord Bot Token
- OpenRouter or NVIDIA API Key

## Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/lightpaycashproject/discord-summary-bot.git
    cd discord-summary-bot
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your details:
    ```bash
    cp .env.example .env
    ```
    - `DISCORD_TOKEN`: Your bot token from the Discord Developer Portal.
    - `CLIENT_ID`: Your bot's Client ID.
    - `GUILD_ID`: The ID of the server where you want to deploy commands (optional, for faster registration).
    - `LLM_API_KEY`: API key for OpenRouter or NVIDIA.
    - `LLM_BASE_URL`: Base URL (e.g., `https://integrate.api.nvidia.com/v1` or `https://openrouter.ai/api/v1`).
    - `LLM_MODEL`: The model ID (e.g., `nvidia/llama-3.1-405b-instruct`).

4.  **Deploy Commands**:
    Register the slash commands with Discord:
    ```bash
    npm run deploy
    ```

5.  **Run the Bot**:
    ```bash
    npm start
    ```

## Development

- **Run Tests**:
    ```bash
    npm test
    ```
- **Linting**:
    Ensure code quality with ESLint (not configured by default but recommended).

## Architecture

- **`src/index.js`**: Main entry point.
- **`src/services/ScraperService.js`**: Handles fetching tweet content via Puppeteer (uses Nitter fallback).
- **`src/services/SummarizerService.js`**: Interfaces with the LLM API.
- **`src/commands/SummarizeCommand.js`**: Implements the `/summarize` logic.

## License

ISC
