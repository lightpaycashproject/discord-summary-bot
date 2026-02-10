const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
} = require("discord.js");
const config = require("../config");
const { validateEnv } = require("./utils/envValidator");
const summarizeCommand = require("./commands/SummarizeCommand");
const adminCommand = require("./commands/AdminCommand");
const helpCommand = require("./commands/HelpCommand");
const scraperService = require("./services/ScraperService");
const db = require("./services/DatabaseService");

// Validate environment variables before starting
try {
  validateEnv(config);
} catch (error) {
  console.error("Configuration Error:", error.message);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message], // Required for DMs
});

client.commands = new Collection();
client.commands.set(summarizeCommand.data.name, summarizeCommand);
client.commands.set(adminCommand.data.name, adminCommand);
client.commands.set(helpCommand.data.name, helpCommand);

const urlRegex =
  /(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+)/g;

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  // Initialize scraper (launch browser if needed, though now using API)
});

// Proactive Scraper & Message Logger
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 1. Log message to database
  try {
    db.saveMessage(
      message.id,
      message.channelId,
      message.guildId,
      message.author.id,
      message.author.username,
      message.content,
      message.createdTimestamp,
    );
  } catch (e) {
    console.error(`Failed to log message ${message.id}:`, e.message);
  }

  // 2. Pre-cache X/Twitter links
  const matches = message.content.match(urlRegex);
  if (matches) {
    for (const url of matches) {
      scraperService.scrapeTweet(url).catch((e) => {
        console.error(`Proactive scrape failed for ${url}:`, e.message);
      });
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  process.exit(0);
});

client.login(config.discord.token);
