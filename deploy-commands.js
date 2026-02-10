const { REST, Routes } = require('discord.js');
const { discord } = require('./config');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./src/commands/${file}`);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(discord.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    if (discord.guildId) {
      // Guild-specific registration (instant update)
      await rest.put(
        Routes.applicationGuildCommands(discord.clientId, discord.guildId),
        { body: commands },
      );
      console.log(`Successfully reloaded commands for guild ${discord.guildId}`);
    } else {
      // Global registration (works across all servers, takes ~1h to propagate)
      await rest.put(
        Routes.applicationCommands(discord.clientId),
        { body: commands },
      );
      console.log('Successfully reloaded global application commands.');
    }
  } catch (error) {
    console.error(error);
  }
})();
