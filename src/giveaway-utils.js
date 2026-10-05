const { randomInt } = require('node:crypto');

const DURATION_UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};
const MAX_GIVEAWAY_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

function parseGiveawayDuration(value) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) return null;
  const duration = Number(match[1]) * DURATION_UNITS[match[2].toLowerCase()];
  return Number.isSafeInteger(duration)
    && duration > 0
    && duration <= MAX_GIVEAWAY_DURATION_MS
    ? duration
    : null;
}

function selectGiveawayWinners(entrants, winnerCount, excluded = []) {
  const excludedSet = new Set(excluded);
  const candidates = entrants.filter((userId) => !excludedSet.has(userId));
  const winners = [];
  while (winners.length < winnerCount && candidates.length) {
    const index = randomInt(candidates.length);
    winners.push(candidates[index]);
    candidates.splice(index, 1);
  }
  return winners;
}

module.exports = { parseGiveawayDuration, selectGiveawayWinners };
