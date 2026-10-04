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
const deployments = DISCORD_GUILD_ID
  ? [
    rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: [] }),
    rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
      { body: commands },
    ),
  ]
  : [rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands })];

Promise.all(deployments)
  .then(() => console.log(
    `Registered ${commands.length} commands ${DISCORD_GUILD_ID ? 'in the development server only' : 'globally'}.`,
  ))
  .catch((error) => {
    console.error('Could not register slash commands:', error);
    process.exitCode = 1;
  });