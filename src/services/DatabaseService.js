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
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT,
        summary_text TEXT,
        timestamp INTEGER
      )`,
    ];
    schemas.forEach((s) => this.db.exec(s));
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

  saveSummary(channelId, lastMessageId, summaryText) {
    this.db
      .query(
        "INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp) VALUES ($channelId, $lastMessageId, $summaryText, $timestamp)",
      )
      .run({
        $channelId: channelId,
        $lastMessageId: lastMessageId,
        $summaryText: summaryText,
        $timestamp: Date.now(),
      });
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
