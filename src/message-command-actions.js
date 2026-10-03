async function replyThenDeleteCommand(message, content) {
  await message.reply(content);
  try {
    await message.delete();
    return null;
  } catch (error) {
    return error;
  }
}

module.exports = { replyThenDeleteCommand };
