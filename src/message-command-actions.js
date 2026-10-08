const { sendV2 } = require('./v2-messages');

async function sendThenDeleteCommand(message, content) {
  await sendV2(message.channel, content);
  try {
    await message.delete();
    return null;
  } catch (error) {
    return error;
  }
}

module.exports = { sendThenDeleteCommand };
