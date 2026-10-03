const assert = require('node:assert/strict');
const test = require('node:test');
const { hasTicketManagerRole } = require('../src/ticket-permissions');

test('configured /setadmin and /setowner members can close their own tickets', () => {
  const settings = { adminRoleId: 'admin', ownerRoleId: 'owner' };

  assert.equal(hasTicketManagerRole(settings, (roleId) => roleId === 'admin'), true);
  assert.equal(hasTicketManagerRole(settings, (roleId) => roleId === 'owner'), true);
  assert.equal(hasTicketManagerRole(settings, (roleId) => roleId === 'ticket-staff'), false);
  assert.equal(hasTicketManagerRole({}, () => true), false);
});
