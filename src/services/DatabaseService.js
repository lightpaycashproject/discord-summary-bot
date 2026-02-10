let Database;
const isBun = typeof Bun !== "undefined";

if (isBun) {
  Database = require("bun:sqlite").Database;
} else {
  Database = require("better-sqlite3");
}

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
    if (isBun) {
      return this.db
        .query("SELECT content FROM scraped_data WHERE url = $url")
        .get({ $url: url });
    }
    return this.db
      .prepare("SELECT content FROM scraped_data WHERE url = ?")
      .get(url);
  }

  saveTweet(url, content) {
    if (isBun) {
      this.db
        .query(
          "INSERT OR REPLACE INTO scraped_data (url, content, timestamp) VALUES ($url, $content, $timestamp)",
        )
        .run({ $url: url, $content: content, $timestamp: Date.now() });
    } else {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO scraped_data (url, content, timestamp) VALUES (?, ?, ?)",
        )
        .run(url, content, Date.now());
    }
  }

  getCachedSummary(channelId, lastMessageId) {
    let row;
    if (isBun) {
      row = this.db
        .query(
          "SELECT summary_text FROM summaries WHERE channel_id = $channelId AND last_message_id = $lastMessageId",
        )
        .get({ $channelId: channelId, $lastMessageId: lastMessageId });
    } else {
      row = this.db
        .prepare(
          "SELECT summary_text FROM summaries WHERE channel_id = ? AND last_message_id = ?",
        )
        .get(channelId, lastMessageId);
    }
    return row ? row.summary_text : null;
  }

  saveSummary(channelId, lastMessageId, summaryText) {
    if (isBun) {
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
    } else {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp) VALUES (?, ?, ?, ?)",
        )
        .run(channelId, lastMessageId, summaryText, Date.now());
    }
  }

  clearChannelCache(channelId) {
    if (isBun) {
      this.db
        .query("DELETE FROM summaries WHERE channel_id = $channelId")
        .run({ $channelId: channelId });
    } else {
      this.db
        .prepare("DELETE FROM summaries WHERE channel_id = ?")
        .run(channelId);
    }
  }

  getStats() {
    let tweets, summaries;
    if (isBun) {
      tweets = this.db
        .query("SELECT COUNT(*) as count FROM scraped_data")
        .get().count;
      summaries = this.db
        .query("SELECT COUNT(*) as count FROM summaries")
        .get().count;
    } else {
      tweets = this.db
        .prepare("SELECT COUNT(*) as count FROM scraped_data")
        .get().count;
      summaries = this.db
        .prepare("SELECT COUNT(*) as count FROM summaries")
        .get().count;
    }
    return { tweets, summaries };
  }

  close() {
    this.db.close();
  }
}

module.exports = new DatabaseService();
