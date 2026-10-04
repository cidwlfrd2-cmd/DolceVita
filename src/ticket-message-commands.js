function parseTicketMessageCommand(content) {
  const [command, ...args] = content.trim().split(/\s+/);
  return command.toLowerCase() === ',calc' ? { name: 'calc', args } : null;
}

module.exports = { parseTicketMessageCommand };
