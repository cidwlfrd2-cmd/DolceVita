// Load a local .env file if present. On Railway, variables are injected into
// process.env by the platform and no .env file exists; dotenv does not override
// variables that are already set.
try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional when variables come from the platform environment.
}

const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
const missing = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Set them in your Railway service variables or in a local .env file.'
  );
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