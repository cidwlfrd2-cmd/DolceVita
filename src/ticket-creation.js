const { ticketOwnerId } = require('./ticket-context');

const ticketCreationLocks = new Map();

function withTicketCreationLock(key, action) {
  const previous = ticketCreationLocks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  ticketCreationLocks.set(key, current);

  return previous.then(action).finally(() => {
    release();
    if (ticketCreationLocks.get(key) === current) ticketCreationLocks.delete(key);
  });
}

function findActiveTicket(channels, ownerId) {
  return [...channels.values()].find((channel) => ticketOwnerId(channel) === ownerId) ?? null;
}

module.exports = { findActiveTicket, withTicketCreationLock };
