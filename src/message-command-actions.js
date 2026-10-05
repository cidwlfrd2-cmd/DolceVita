async function sendThenDeleteCommand(message, content) {
  await message.channel.send(content);
  try {
    await message.delete();
    return null;
  } catch (error) {
    return error;
  }
}

module.exports = { sendThenDeleteCommand };
