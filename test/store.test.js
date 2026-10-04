const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OrderStore } = require('../src/store');
const { orderButtons, orderEmbed, orderStatusEmbed, queueEmbed } = require('../src/embeds');
const { orderReference } = require('../src/order-reference');
const { orderStatusLabel } = require('../src/order-status');

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dolce-vita-'));
  return new OrderStore(path.join(directory, 'orders.json'));
}

test('orders persist, can be claimed in order, and leave the active queue when finished', () => {
  const store = createStore();
  store.setSettings('guild-1', { channelId: 'channel-1', staffRoleId: null });
  const first = store.addOrder({ guildId: 'guild-1', customerId: 'user-1', sourceChannelId: 'source-1', items: 'Latte', paymentMethod: 'Card', supporterId: 'staff-1', quantity: 2 });
  const second = store.addOrder({ guildId: 'guild-1', customerId: 'user-2', sourceChannelId: 'source-2', items: 'Tea', paymentMethod: 'Cash', supporterId: 'staff-2', quantity: 1 });

  const restartedStore = new OrderStore(store.filePath);
  assert.equal(restartedStore.getSettings('guild-1').channelId, 'channel-1');
  restartedStore.setSettings('guild-1', { vouchChannelId: 'vouch-channel' });
  assert.deepEqual(restartedStore.getSettings('guild-1'), {
    channelId: 'channel-1',
    staffRoleId: null,
    vouchChannelId: 'vouch-channel',
  });
  restartedStore.setSettings('guild-1', { channelId: 'orders-updated', staffRoleId: 'staff-role' });
  assert.equal(restartedStore.getSettings('guild-1').vouchChannelId, 'vouch-channel');
  restartedStore.setSettings('guild-1', { ownerRoleId: 'order-owner-role' });
  assert.equal(restartedStore.getSettings('guild-1').ownerRoleId, 'order-owner-role');
  restartedStore.setSettings('guild-1', { adminRoleId: 'order-admin-role' });
  assert.equal(restartedStore.getSettings('guild-1').adminRoleId, 'order-admin-role');
  restartedStore.setSettings('guild-1', { orderChannelId: 'orders-channel' });
  assert.equal(restartedStore.getSettings('guild-1').orderChannelId, 'orders-channel');
  assert.deepEqual(restartedStore.listActive('guild-1').map((order) => order.id), [first.id, second.id]);
  assert.equal(restartedStore.getOrder(first.id).processingStatus, 'not_yet');
  assert.equal(restartedStore.getOrder(first.id).supporterId, 'staff-1');
  assert.equal(restartedStore.getOrder(first.id).sourceChannelId, 'source-1');
  assert.equal(restartedStore.claimNext('guild-1', 'staff-1').id, first.id);
  assert.equal(restartedStore.finishOrder(first.id, 'completed').status, 'completed');
  assert.deepEqual(restartedStore.listActive('guild-1').map((order) => order.id), [second.id]);
  assert.equal(restartedStore.finishOrder(first.id, 'cancelled'), null);
  const processingOrder = restartedStore.markProcessing(second.id, 'staff-2');
  assert.equal(processingOrder.processingStatus, 'processing');
  assert.equal(processingOrder.status, 'claimed');
  assert.equal(processingOrder.processingBy, 'staff-2');
  assert.equal(restartedStore.finishOrder(second.id, 'cancelled').status, 'cancelled');
  assert.deepEqual(restartedStore.listActive('guild-1'), []);
});

test('orders remain active until 48 hours and then expire from actions and the queue', () => {
  const store = createStore();
  const order = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-1',
    sourceChannelId: 'source-1',
    items: 'Latte',
    paymentMethod: 'Card',
    supporterId: 'staff-1',
    quantity: 1,
  });
  const state = store.read();
  const createdAt = Date.now() - (48 * 60 * 60 * 1000) + 60_000;
  state.orders[0].createdAt = new Date(createdAt).toISOString();
  store.write(state);

  assert.deepEqual(store.listActive('guild-1').map((entry) => entry.id), [order.id]);
  assert.equal(store.finishOrder(order.id, 'completed').status, 'completed');

  const expiredByQueue = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-2',
    sourceChannelId: 'source-2',
    items: 'Tea',
    paymentMethod: 'Cash',
    supporterId: 'staff-2',
    quantity: 1,
  });
  const expiredByQueueState = store.read();
  expiredByQueueState.orders.find((entry) => entry.id === expiredByQueue.id).createdAt =
    new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  store.write(expiredByQueueState);

  assert.deepEqual(store.listActive('guild-1'), []);
  const expired = store.getOrder(expiredByQueue.id);
  assert.equal(expired.status, 'expired');
  assert.equal(
    Date.parse(expired.expiredAt),
    Date.parse(expired.createdAt) + 48 * 60 * 60 * 1000,
  );
  assert.ok(orderButtons(expired).toJSON().components.every((button) => button.disabled));

  const expiredBeforeProcessing = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-3',
    sourceChannelId: 'source-3',
    items: 'Cake',
    paymentMethod: 'Cash',
    supporterId: 'staff-3',
    quantity: 1,
  });
  const processingState = store.read();
  processingState.orders.find((entry) => entry.id === expiredBeforeProcessing.id).createdAt =
    new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  store.write(processingState);
  assert.equal(store.markProcessing(expiredBeforeProcessing.id, 'staff-3'), null);
  assert.equal(store.getOrder(expiredBeforeProcessing.id).status, 'expired');

  const expiredBeforeClaim = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-4',
    sourceChannelId: 'source-4',
    items: 'Coffee',
    paymentMethod: 'Cash',
    supporterId: 'staff-4',
    quantity: 1,
  });
  const claimState = store.read();
  claimState.orders.find((entry) => entry.id === expiredBeforeClaim.id).createdAt =
    new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  store.write(claimState);
  assert.equal(store.claimNext('guild-1', 'staff-4'), null);
  assert.equal(store.getOrder(expiredBeforeClaim.id).status, 'expired');
});

test('claim returns null when there are no pending orders', () => {
  const store = createStore();
  assert.equal(store.claimNext('guild-1', 'staff-1'), null);
});

test('ticket product is displayed as the order reference while buttons retain the UUID', () => {
  assert.equal(orderReference({ id: 'ORDER-LEGACY' }), 'ORDER-LEGACY');
  const store = createStore();
  const order = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-1',
    sourceChannelId: 'source-1',
    items: 'GAMECREDITS',
    paymentMethod: 'GCASH',
    supporterId: 'staff-1',
    quantity: 1,
    ticketProduct: 'GAMECREDITS',
  });

  assert.equal(orderReference(store.getOrder(order.id)), 'GAMECREDITS');
  assert.deepEqual(
    orderButtons(order).toJSON().components.map((button) => [button.custom_id, button.label]),
    [
      [`order:processing:${order.id}`, 'processing'],
      [`order:complete:${order.id}`, 'complete'],
      [`order:cancel:${order.id}`, 'cancelled'],
    ],
  );
  assert.match(queueEmbed([order]).toJSON().fields[0].name, /#GAMECREDITS/);
});

test('completed and cancelled statuses override processing in the order embed', () => {
  const order = {
    id: 'ORDER-1',
    status: 'completed',
    processingStatus: 'processing',
    items: 'Coffee',
    quantity: 1,
    customerId: 'customer-1',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    sourceChannelId: 'source-1',
    createdAt: new Date().toISOString(),
  };

  const completedEmbed = orderEmbed(order).toJSON();
  assert.match(completedEmbed.description, /status: __\*\*done\*\*__/);
  const cancelledEmbed = orderEmbed({ ...order, status: 'cancelled' }).toJSON();
  assert.match(cancelledEmbed.description, /status: __\*\*cancelled\*\*__/);
});

test('source-channel status labels reflect processing, complete, and cancelled transitions', () => {
  assert.equal(orderStatusLabel({ status: 'claimed', processingStatus: 'processing' }), 'Processing');
  assert.equal(orderStatusLabel({ status: 'completed', processingStatus: 'processing' }), 'Complete');
  assert.equal(orderStatusLabel({ status: 'cancelled', processingStatus: 'not_yet' }), 'Cancelled');
});

test('order status notification embed includes the order status and details', () => {
  const embed = orderStatusEmbed({
    id: 'ORDER-3',
    ticketProduct: 'DEKOR',
    status: 'completed',
    processingStatus: 'processing',
    items: 'Coffee',
    quantity: 2,
    paymentMethod: 'Card',
    sourceChannelId: 'source-1',
  }).toJSON();

  assert.equal(embed.title, 'Order Status Update');
  assert.match(embed.description, /#DEKOR.*Complete/);
  assert.deepEqual(
    embed.fields.map(({ name, value }) => [name, value]),
    [
      ['Items', 'Coffee'],
      ['Quantity', '2'],
      ['Payment method', 'Card'],
      ['Submitted in', '<#source-1>'],
    ],
  );
});

test('new order embed keeps ticket owner and assigned supporter in the correct labels', () => {
  const embed = orderEmbed({
    id: 'ORDER-2',
    status: 'pending',
    processingStatus: 'not_yet',
    items: 'Coffee',
    quantity: 1,
    customerId: 'customer-1',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    sourceChannelId: 'source-1',
    createdAt: new Date().toISOString(),
  }).toJSON();

  assert.equal(embed.fields, undefined);
  assert.equal(embed.description, [
    '_ _',
    ' _ _    🧁order from <#source-1>',
    ' _ _     ༄   Coffee',
    ' _ _     ༄   paid via Cash',
    ' _ _     ༄   status: __**noted**__',
    '-# _ _       served by <@staff-1>',
    '_ _',
  ].join('\n'));

  const missingOwnerEmbed = orderEmbed({
    id: 'ORDER-3',
    status: 'pending',
    processingStatus: 'not_yet',
    items: 'Tea',
    quantity: 2,
    paymentMethod: 'GCASH',
    sourceChannelId: 'source-2',
    createdAt: new Date().toISOString(),
  }).toJSON();
  assert.match(missingOwnerEmbed.description, /order from <#source-2>/);
  assert.match(missingOwnerEmbed.description, /served by Not assigned/);
});

test('order embed uses the order channel and stylized status line requested by staff', () => {
  const embed = orderEmbed({
    id: 'ORDER-9',
    status: 'pending',
    processingStatus: 'not_yet',
    items: 'Coffee',
    quantity: 1,
    customerId: 'customer-1',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    sourceChannelId: 'source-1',
    createdAt: new Date().toISOString(),
  }).toJSON();

  assert.match(embed.description, /order from <#source-1>/);
  assert.match(embed.description, /status: __\*\*noted\*\*__/);
  assert.match(embed.description, /served by <@staff-1>/);
});

test('vouch embed omits warranty text and shows the date in Philippine time', () => {
  const date = new Date('2024-01-01T00:00:00Z');
  const embed = require('../src/embeds').vouchEmbed({ id: 'user-1' }, 'Coffee', 'Great service', date).toJSON();

  assert.equal(embed.description, undefined);
  const vouchDateField = embed.fields.find((field) => field.name === '🔹 date vouched');
  assert.ok(vouchDateField);
  const expected = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(date) + ' PHT (UTC+8)';
  assert.equal(vouchDateField.value, expected);
});

test('vouches persist and are counted only for the requested user and server', () => {
  const store = createStore();
  store.addVouch({ guildId: 'guild-1', userId: 'user-1', items: 'Latte' });
  store.addVouch({ guildId: 'guild-1', userId: 'user-1', items: 'Tea' });
  store.addVouch({ guildId: 'guild-1', userId: 'user-2', items: 'Cake' });
  store.addVouch({ guildId: 'guild-2', userId: 'user-1', items: 'Coffee' });

  const restartedStore = new OrderStore(store.filePath);
  const vouches = restartedStore.listVouches('guild-1', 'user-1');
  assert.equal(vouches.length, 2);
  assert.deepEqual(vouches.map((vouch) => vouch.items).sort(), ['Latte', 'Tea']);
});

test('sticky messages persist per channel and can be replaced or removed', () => {
  const store = createStore();
  assert.equal(store.setStickyMessage('guild-1', 'channel-1', 'First notice', 'message-1'), null);
  const replaced = store.setStickyMessage('guild-1', 'channel-1', 'Updated notice', 'message-2');
  assert.equal(replaced.content, 'First notice');

  const restartedStore = new OrderStore(store.filePath);
  assert.deepEqual(restartedStore.getStickyMessage('guild-1', 'channel-1'), {
    guildId: 'guild-1',
    channelId: 'channel-1',
    content: 'Updated notice',
    messageId: 'message-2',
  });
  assert.equal(restartedStore.getStickyMessage('guild-1', 'channel-2'), null);
  assert.equal(restartedStore.removeStickyMessage('guild-1', 'channel-1').messageId, 'message-2');
  assert.equal(restartedStore.getStickyMessage('guild-1', 'channel-1'), null);
});