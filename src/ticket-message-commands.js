function parseTicketMessageCommand(content) {
  const [command, ...args] = content.trim().split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  if (normalizedCommand === ',help') {
    return args.length === 0 ? { name: normalizedCommand.slice(1), args } : null;
  }
  if (normalizedCommand === ',ticketsetup') {
    return args.length === 0 ? { name: 'ticketsetup', args } : null;
  }
  if (normalizedCommand === ',setupticketcategory') {
    return { name: 'setupticketcategory', args };
  }
  if (normalizedCommand === ',set' && args[0]?.toLowerCase() === 'ticket_transcript') {
    return { name: 'set_ticket_transcript', args: args.slice(1) };
  }
  return null;
}

module.exports = { parseTicketMessageCommand };
