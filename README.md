# Discord Summary Bot

A high-performance Discord bot that summarizes conversations in text channels using AI (OpenRouter) and scrapes context from X.com links. **Built optimized specifically for the Bun runtime.**

## Features

- **Summarize Conversations**: Use `/summarize` to get a structured summary of the last 24 hours of messages.
- **X.com Thread Unrolling**: Automatically fetches and unrolls X.com / Twitter threads, including quoted tweets and images, using the FixTweet API.
- **Crypto & Alpha Expert**: Optimized AI persona to identify projects, alpha, and crypto signals.
- **User Contribution Tracking**: Breaks down what each participant contributed to the discussion.
- **Smart Caching**: Local SQLite database (`bun:sqlite`) caches scraping results and summaries for maximum performance and token efficiency.
- **Streaming Delivery**: Watch the summary appear live in your DMs.

## Prerequisites

- **Bun (v1.1+)**: This project is optimized for Bun and uses `bun:sqlite` and native `fetch`. Node.js is not supported.
- Discord Bot Token
- OpenRouter API Key

## Setup

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/lightpaycashproject/discord-summary-bot.git
    cd discord-summary-bot
    ```

2.  **Install dependencies**:

    ```bash
    bun install
    ```

3.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your details:

    ```bash
    cp .env.example .env
    ```

    - `DISCORD_TOKEN`: Your bot token.
    - `CLIENT_ID`: Your bot's Client ID.
    - `GUILD_ID`: (Optional) The ID of a specific server for instant command registration.
    - `ADMIN_USER_ID`: Your Discord User ID for admin commands.
    - `LLM_API_KEY`: Your OpenRouter API key.

4.  **Deploy Commands**:

    ```bash
    bun run deploy
    ```

5.  **Run the Bot**:
    ```bash
    bun start
    ```

## Development

- **Run Tests**:
  ```bash
  bun test
  ```
- **Coverage**:
  ```bash
  bun run test:coverage
  ```
- **Linting**:
  ```bash
  bun run lint
  ```

## Architecture

- **`src/index.js`**: Main entry point.
- **`src/services/ScraperService.js`**: Recursive X.com thread fetcher using `fetch`.
- **`src/services/SummarizerService.js`**: OpenRouter SDK integration with streaming.
- **`src/services/DatabaseService.js`**: Persistence layer using `bun:sqlite`.
- **`src/commands/SummarizeCommand.js`**: The main `/summarize` logic.
- **`src/commands/AdminCommand.js`**: Administrative tools (`/admin stats`, `/admin clear-cache`).

## License

ISC
