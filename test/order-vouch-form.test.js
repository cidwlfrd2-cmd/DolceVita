const assert = require('node:assert/strict');
const test = require('node:test');
const { parseOrderVouchForm } = require('../src/order-vouch-form');

test('order vouch form accepts the supported products and quantities', () => {
  assert.deepEqual(parseOrderVouchForm({
    product: ' gamecredits ',
    quantity: '0007',
    feedback: ' Great service! ',
  }), {
    value: {
      product: 'GAMECREDITS',
      quantity: '7',
      feedback: 'Great service!',
    },
  });
  assert.deepEqual(parseOrderVouchForm({
    product: 'DEKOR',
    quantity: '1000',
    feedback: 'Good',
  }), {
    value: { product: 'DEKOR', quantity: '1000', feedback: 'Good' },
  });
  assert.deepEqual(parseOrderVouchForm({
    product: 'SVBOOST',
    quantity: '1',
    feedback: 'Good',
  }), {
    value: { product: 'SVBOOST', quantity: '1', feedback: 'Good' },
  });
});

test('order vouch form rejects unsupported products, invalid quantities, and blank feedback', () => {
  assert.deepEqual(parseOrderVouchForm({
    product: 'OTHER',
    quantity: '1',
    feedback: 'Good',
  }), { error: 'PRODUCT must be DEKOR, GAMECREDITS, SVBOOST, or ROBUX.' });
  assert.deepEqual(parseOrderVouchForm({
    product: 'ROBUX',
    quantity: '1001',
    feedback: 'Good',
  }), { error: 'QUANTITY must be a whole number from 1 to 1000.' });
  assert.deepEqual(parseOrderVouchForm({
    product: 'ROBUX',
    quantity: '1.5',
    feedback: 'Good',
  }), { error: 'QUANTITY must be a whole number from 1 to 1000.' });
  assert.deepEqual(parseOrderVouchForm({
    product: 'ROBUX',
    quantity: '1',
    feedback: '  ',
  }), { error: 'FEEDBACK cannot be blank.' });
});
