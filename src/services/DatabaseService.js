const { Database } = require("bun:sqlite");
const { database } = require("../../config");

class DatabaseService {
  constructor() {
    this.db = new Database(database.path);
    this.init();
  }

  init() {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS scraped_data (
        url TEXT PRIMARY KEY,
        content TEXT,
        timestamp INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS summaries (
        channel_id TEXT,
        last_message_id TEXT,
        summary_text TEXT,
        timestamp INTEGER,
        guild_id TEXT,
        user_id TEXT,
        token_count INTEGER DEFAULT 0,
        PRIMARY KEY (channel_id, last_message_id)
      )`,
      `CREATE TABLE IF NOT EXISTS usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        guild_id TEXT,
        channel_id TEXT,
        tokens INTEGER,
        type TEXT,
        timestamp INTEGER
      )`,
    ];
    schemas.forEach((s) => this.db.exec(s));

    // Migration: Add columns if they don't exist in summaries
    try {
      this.db.exec("ALTER TABLE summaries ADD COLUMN guild_id TEXT");
      this.db.exec("ALTER TABLE summaries ADD COLUMN user_id TEXT");
      this.db.exec("ALTER TABLE summaries ADD COLUMN token_count INTEGER DEFAULT 0");
    } catch (e) {
      // Columns already exist
    }
  }

  getCachedTweet(url) {
    return this.db
      .query("SELECT content FROM scraped_data WHERE url = $url")
      .get({ $url: url });
  }

  saveTweet(url, content) {
    this.db
      .query(
        "INSERT OR REPLACE INTO scraped_data (url, content, timestamp) VALUES ($url, $content, $timestamp)",
      )
      .run({ $url: url, $content: content, $timestamp: Date.now() });
  }

  getCachedSummary(channelId, lastMessageId) {
    const row = this.db
      .query(
        "SELECT summary_text FROM summaries WHERE channel_id = $channelId AND last_message_id = $lastMessageId",
      )
      .get({ $channelId: channelId, $lastMessageId: lastMessageId });
    return row ? row.summary_text : null;
  }

  logUsage(userId, guildId, channelId, tokens, type = "summary") {
    this.db
      .query(
        "INSERT INTO usage_stats (user_id, guild_id, channel_id, tokens, type, timestamp) VALUES ($userId, $guildId, $channelId, $tokens, $type, $timestamp)",
      )
      .run({
        $userId: userId,
        $guildId: guildId,
        $channelId: channelId,
        $tokens: tokens,
        $type: type,
        $timestamp: Date.now(),
      });
  }

  saveSummary(channelId, lastMessageId, summaryText, guildId = null, userId = null, tokens = 0) {
    this.db
      .query(
        "INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp, guild_id, user_id, token_count) VALUES ($channelId, $lastMessageId, $summaryText, $timestamp, $guildId, $userId, $tokens)",
      )
      .run({
        $channelId: channelId,
        $lastMessageId: lastMessageId,
        $summaryText: summaryText,
        $timestamp: Date.now(),
        $guildId: guildId,
        $userId: userId,
        $tokens: tokens,
      });

    if (userId && guildId) {
      this.logUsage(userId, guildId, channelId, tokens, "summary");
    }
  }

  getDetailedStats() {
    const topUsers = this.db
      .query(
        "SELECT user_id, SUM(tokens) as total_tokens, COUNT(*) as count FROM usage_stats GROUP BY user_id ORDER BY total_tokens DESC LIMIT 5",
      )
      .all();
    const topGuilds = this.db
      .query(
        "SELECT guild_id, SUM(tokens) as total_tokens, COUNT(*) as count FROM usage_stats GROUP BY guild_id ORDER BY total_tokens DESC LIMIT 5",
      )
      .all();
    const totalTokens =
      this.db.query("SELECT SUM(tokens) as total FROM usage_stats").get()
        .total || 0;

    return { topUsers, topGuilds, totalTokens };
  }

  clearChannelCache(channelId) {
    this.db
      .query("DELETE FROM summaries WHERE channel_id = $channelId")
      .run({ $channelId: channelId });
  }

  getStats() {
    const tweets = this.db
      .query("SELECT COUNT(*) as count FROM scraped_data")
      .get().count;
    const summaries = this.db
      .query("SELECT COUNT(*) as count FROM summaries")
      .get().count;
    return { tweets, summaries };
  }

  close() {
    this.db.close();
  }
}

module.exports = new DatabaseService();
