let Database;
if (typeof Bun !== 'undefined') {
  Database = require('bun:sqlite').Database;
} else {
  // Use a string to hide it from Bun's parser if needed, 
  // but usually just wrapping in the conditional is enough.
  // We'll use dynamic import for Node to be safe.
  Database = require('better-sqlite3');
}

const { database } = require('../../config');

class DatabaseService {
  constructor() {
    this.db = new Database(database.path);
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_data (
        url TEXT PRIMARY KEY,
        content TEXT,
        timestamp INTEGER
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS summaries (
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT,
        summary_text TEXT,
        timestamp INTEGER
      )
    `);
  }

  getCachedTweet(url) {
    if (typeof Bun !== 'undefined') {
      const stmt = this.db.query('SELECT content FROM scraped_data WHERE url = $url');
      const row = stmt.get({ $url: url });
      return row ? row : null;
    } else {
      const row = this.db.prepare('SELECT content FROM scraped_data WHERE url = ?').get(url);
      return row ? row : null;
    }
  }

  saveTweet(url, content) {
    if (typeof Bun !== 'undefined') {
      const stmt = this.db.query('INSERT OR REPLACE INTO scraped_data (url, content, timestamp) VALUES ($url, $content, $timestamp)');
      stmt.run({ $url: url, $content: content, $timestamp: Date.now() });
    } else {
      this.db.prepare('INSERT OR REPLACE INTO scraped_data (url, content, timestamp) VALUES (?, ?, ?)')
        .run(url, content, Date.now());
    }
  }

  getCachedSummary(channelId, lastMessageId) {
    let row;
    if (typeof Bun !== 'undefined') {
      const stmt = this.db.query('SELECT summary_text, timestamp FROM summaries WHERE channel_id = $channelId AND last_message_id = $lastMessageId');
      row = stmt.get({ $channelId: channelId, $lastMessageId: lastMessageId });
    } else {
      row = this.db.prepare('SELECT summary_text, timestamp FROM summaries WHERE channel_id = ? AND last_message_id = ?')
        .get(channelId, lastMessageId);
    }
    
    return row ? row.summary_text : null;
  }

  saveSummary(channelId, lastMessageId, summaryText) {
    if (typeof Bun !== 'undefined') {
      const stmt = this.db.query('INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp) VALUES ($channelId, $lastMessageId, $summaryText, $timestamp)');
      stmt.run({ $channelId: channelId, $lastMessageId: lastMessageId, $summaryText: summaryText, $timestamp: Date.now() });
    } else {
      this.db.prepare('INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp) VALUES (?, ?, ?, ?)')
        .run(channelId, lastMessageId, summaryText, Date.now());
    }
  }

  clearChannelCache(channelId) {
    if (typeof Bun !== 'undefined') {
      this.db.query('DELETE FROM summaries WHERE channel_id = $channelId').run({ $channelId: channelId });
    } else {
      this.db.prepare('DELETE FROM summaries WHERE channel_id = ?').run(channelId);
    }
  }

  getStats() {
    let tweets, summaries;
    if (typeof Bun !== 'undefined') {
      tweets = this.db.query('SELECT COUNT(*) as count FROM scraped_data').get().count;
      summaries = this.db.query('SELECT COUNT(*) as count FROM summaries').get().count;
    } else {
      tweets = this.db.prepare('SELECT COUNT(*) as count FROM scraped_data').get().count;
      summaries = this.db.prepare('SELECT COUNT(*) as count FROM summaries').get().count;
    }
    return { tweets, summaries };
  }

  close() {
    this.db.close();
  }
}

module.exports = new DatabaseService();
