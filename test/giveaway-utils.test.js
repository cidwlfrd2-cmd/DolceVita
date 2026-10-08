const assert = require('node:assert/strict');
const test = require('node:test');
const { parseGiveawayDuration, selectGiveawayWinners } = require('../src/giveaway-utils');

test('giveaway duration accepts supported units within one year', () => {
  assert.equal(parseGiveawayDuration('30m'), 30 * 60 * 1000);
  assert.equal(parseGiveawayDuration('12h'), 12 * 60 * 60 * 1000);
  assert.equal(parseGiveawayDuration('7d'), 7 * 24 * 60 * 60 * 1000);
  assert.equal(parseGiveawayDuration('0s'), null);
  assert.equal(parseGiveawayDuration('366d'), null);
  assert.equal(parseGiveawayDuration('1w'), null);
});

test('giveaway winner selection avoids duplicates and excluded winners', () => {
  const winner = selectGiveawayWinners(['a', 'b', 'c'], 2, ['a']);
  assert.equal(winner.length, 2);
  assert.ok(winner.every((id) => ['b', 'c'].includes(id)));
  assert.equal(new Set(winner).size, winner.length);
  assert.deepEqual(selectGiveawayWinners(['a'], 1, ['a']), []);
});
