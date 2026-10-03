require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  throw new Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID in your .env file.');
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

rest.put(route, { body: commands })
  .then(() => console.log(`Registered ${commands.length} commands${DISCORD_GUILD_ID ? ' for the development server' : ' globally'}.`))
  .catch((error) => {
    console.error('Could not register slash commands:', error);
    process.exitCode = 1;
  });