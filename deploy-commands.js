const { REST, Routes } = require('discord.js');
const { discord } = require('./config');
const fs = require('fs');

const commands = [];
const commandFiles = fs.readdirSync('./src/commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./src/commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(discord.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationGuildCommands(discord.clientId, discord.guildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
