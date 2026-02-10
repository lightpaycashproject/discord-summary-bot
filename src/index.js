const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const summarizeCommand = require('./commands/SummarizeCommand');
const adminCommand = require('./commands/AdminCommand');
const ScraperService = require('./services/ScraperService');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();
client.commands.set(summarizeCommand.data.name, summarizeCommand);
client.commands.set(adminCommand.data.name, adminCommand);

client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  // Initialize scraper (launch browser)
  ScraperService.init().catch(console.error);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

// Handle graceful shutdown to close browser
process.on('SIGINT', async () => {
  console.log('Closing browser...');
  await ScraperService.close();
  process.exit(0);
});

client.login(config.discord.token);
