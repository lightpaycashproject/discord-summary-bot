const { Database } = require("bun:sqlite");
const { database } = require("../../config");

class DatabaseService {
  constructor() {
    this.db = new Database(database.path);
    this.db.exec("PRAGMA journal_mode = WAL;"); // Enable WAL mode for performance
    this.init();
  }

  init() {
    // Create meta table to track schema version
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    const currentVersion = this.getSchemaVersion();

    const migrations = [
      {
        version: 1,
        run: () => {
          this.db.exec(`CREATE TABLE IF NOT EXISTS scraped_data (
            url TEXT PRIMARY KEY,
            content TEXT,
            timestamp INTEGER
          )`);
          this.db.exec(`CREATE TABLE IF NOT EXISTS summaries (
            channel_id TEXT,
            last_message_id TEXT,
            summary_text TEXT,
            timestamp INTEGER,
            PRIMARY KEY (channel_id, last_message_id)
          )`);
          this.db.exec(`CREATE TABLE IF NOT EXISTS usage_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            guild_id TEXT,
            channel_id TEXT,
            tokens INTEGER,
            timestamp INTEGER
          )`);
        },
      },
      {
        version: 2,
        run: () => {
          // Add tracking columns to summaries
          const summaryCols = [
            { col: "guild_id", type: "TEXT" },
            { col: "user_id", type: "TEXT" },
            { col: "token_count", type: "INTEGER DEFAULT 0" },
            { col: "cost", type: "REAL DEFAULT 0" },
            { col: "model", type: "TEXT" },
          ];
          summaryCols.forEach(({ col, type }) => {
            try {
              this.db.exec(`ALTER TABLE summaries ADD COLUMN ${col} ${type}`);
            } catch {
              /* ignore */
            }
          });

          // Add cost/model to usage_stats
          const usageCols = [
            { col: "cost", type: "REAL DEFAULT 0" },
            { col: "model", type: "TEXT" },
            { col: "type", type: "TEXT DEFAULT 'summary'" },
          ];
          usageCols.forEach(({ col, type }) => {
            try {
              this.db.exec(`ALTER TABLE usage_stats ADD COLUMN ${col} ${type}`);
            } catch {
              /* ignore */
            }
          });
        },
      },
    ];

    migrations.forEach((m) => {
      if (m.version > currentVersion) {
        m.run();
        this.setSchemaVersion(m.version);
      }
    });
  }

  getSchemaVersion() {
    const row = this.db
      .query("SELECT value FROM schema_meta WHERE key = 'version'")
      .get();
    return row ? parseInt(row.value) : 0;
  }

  setSchemaVersion(v) {
    this.db
      .query(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', $v)",
      )
      .run({ $v: v.toString() });
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

  /**
   * Returns a summary if one exists for the channel created within the TTL.
   * @param {string} channelId
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {string|null}
   */
  getRecentSummary(channelId, ttlMs = 300000) {
    const cutoff = Date.now() - ttlMs;
    const row = this.db
      .query(
        "SELECT summary_text FROM summaries WHERE channel_id = $channelId AND timestamp > $cutoff ORDER BY timestamp DESC LIMIT 1",
      )
      .get({ $channelId: channelId, $cutoff: cutoff });
    return row ? row.summary_text : null;
  }

  logUsage(userId, guildId, channelId, tokens, cost, model, type = "summary") {
    this.db
      .query(
        "INSERT INTO usage_stats (user_id, guild_id, channel_id, tokens, cost, model, type, timestamp) VALUES ($userId, $guildId, $channelId, $tokens, $cost, $model, $type, $timestamp)",
      )
      .run({
        $userId: userId,
        $guildId: guildId,
        $channelId: channelId,
        $tokens: tokens,
        $cost: cost,
        $model: model,
        $type: type,
        $timestamp: Date.now(),
      });
  }

  saveSummary(
    channelId,
    lastMessageId,
    summaryText,
    guildId = null,
    userId = null,
    tokens = 0,
    cost = 0,
    model = null,
  ) {
    this.db
      .query(
        "INSERT OR REPLACE INTO summaries (channel_id, last_message_id, summary_text, timestamp, guild_id, user_id, token_count, cost, model) VALUES ($channelId, $lastMessageId, $summaryText, $timestamp, $guildId, $userId, $tokens, $cost, $model)",
      )
      .run({
        $channelId: channelId,
        $lastMessageId: lastMessageId,
        $summaryText: summaryText,
        $timestamp: Date.now(),
        $guildId: guildId,
        $userId: userId,
        $tokens: tokens,
        $cost: cost,
        $model: model,
      });

    if (userId && guildId) {
      this.logUsage(userId, guildId, channelId, tokens, cost, model, "summary");
    }
  }

  getDetailedStats() {
    const topUsers = this.db
      .query(
        "SELECT user_id, SUM(tokens) as total_tokens, SUM(cost) as total_cost, COUNT(*) as count FROM usage_stats GROUP BY user_id ORDER BY total_cost DESC LIMIT 5",
      )
      .all();
    const topGuilds = this.db
      .query(
        "SELECT guild_id, SUM(tokens) as total_tokens, SUM(cost) as total_cost, COUNT(*) as count FROM usage_stats GROUP BY guild_id ORDER BY total_cost DESC LIMIT 5",
      )
      .all();
    const modelStats = this.db
      .query(
        "SELECT model, SUM(tokens) as total_tokens, SUM(cost) as total_cost, COUNT(*) as count FROM usage_stats GROUP BY model ORDER BY total_cost DESC",
      )
      .all();
    const totals = this.db
      .query(
        "SELECT SUM(tokens) as totalTokens, SUM(cost) as totalCost FROM usage_stats",
      )
      .get();

    return {
      topUsers,
      topGuilds,
      modelStats,
      totalTokens: (totals && totals.totalTokens) || 0,
      totalCost: (totals && totals.totalCost) || 0,
    };
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
