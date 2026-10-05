function parseTicketMessageCommand(content) {
  const [command, ...args] = content.trim().split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  if (normalizedCommand === ',calc') return { name: 'calc', args };
  return null;
}

module.exports = { parseTicketMessageCommand };
