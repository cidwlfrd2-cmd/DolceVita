function parseTicketMessageCommand(content) {
  const [command, ...args] = content.trim().split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  if (normalizedCommand === ',help') {
    return args.length === 0 ? { name: normalizedCommand.slice(1), args } : null;
  }
  if (normalizedCommand === ',ticketsetup') {
    return args.length === 0 ? { name: 'ticketsetup', args } : null;
  }
  if (normalizedCommand === ',botpronouns') {
    const action = args[0]?.toLowerCase();
    if (!action) return { name: 'botpronouns', action: 'show', args: [] };
    if (!['add', 'remove', 'change'].includes(action)) return null;
    return { name: 'botpronouns', action, args: args.slice(1) };
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
