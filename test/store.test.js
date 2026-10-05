const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OrderStore } = require('../src/store');
const { orderButtons, orderContainer, orderStatusEmbed, queueEmbed } = require('../src/embeds');
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

test('completed and cancelled statuses override processing in the order container', () => {
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

  const completedContainer = orderContainer(order).toJSON();
  assert.match(completedContainer.components[0].content, /status: __\*\*done\*\*__/);
  const cancelledContainer = orderContainer({ ...order, status: 'cancelled' }).toJSON();
  assert.match(cancelledContainer.components[0].content, /status: __\*\*cancelled\*\*__/);
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

test('new order container keeps ticket owner and assigned supporter in the correct labels', () => {
  const container = orderContainer({
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

  assert.equal(container.type, 17);
  assert.equal(container.components[1].type, 1);
  assert.equal(container.components[1].components.length, 3);
  const content = container.components[0].content;
  assert.equal(content, [
    '_ _',
    ' _ _    🧁   order from <#source-1>',
    '  _ _     ⤷   Coffee',
    '   _ _     ⤷   paid via Cash',
    '    _ _     ⤷   status: __**noted**__',
    '     _ _     ⤷   served by <@staff-1>',
    '     _ _',
  ].join('\n'));
  assert.doesNotMatch(content, /Submitted|<t:\d+/);
  assert.deepEqual(
    container.components[1].components.map(({ label }) => label),
    ['processing', 'complete', 'cancelled'],
  );

  const missingOwnerContainer = orderContainer({
    id: 'ORDER-3',
    status: 'pending',
    processingStatus: 'not_yet',
    items: 'Tea',
    quantity: 2,
    paymentMethod: 'GCASH',
    sourceChannelId: 'source-2',
    createdAt: new Date().toISOString(),
  }).toJSON();
  assert.match(missingOwnerContainer.components[0].content, /order from <#source-2>/);
  assert.match(missingOwnerContainer.components[0].content, /⤷   served by Not assigned/);
});

test('order container uses the source channel and stylized status line', () => {
  const container = orderContainer({
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

  assert.match(container.components[0].content, /order from <#source-1>/);
  assert.match(container.components[0].content, /status: __\*\*noted\*\*__/);
  assert.match(container.components[0].content, /⤷   served by <@staff-1>/);
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

test('completed orders qualify for voided-role removal only when vouched within 12 hours', () => {
  const store = createStore();
  const atLimit = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-1',
    sourceChannelId: 'ticket-1',
    items: 'Latte',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    quantity: 1,
  });
  const tooOld = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-1',
    sourceChannelId: 'ticket-2',
    items: 'Tea',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    quantity: 1,
  });
  const otherCustomer = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-2',
    sourceChannelId: 'ticket-3',
    items: 'Cake',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    quantity: 1,
  });
  for (const order of [atLimit, tooOld, otherCustomer]) store.finishOrder(order.id, 'completed');

  const vouchTime = new Date('2026-10-05T12:00:00.000Z');
  const state = store.read();
  state.orders.find((order) => order.id === atLimit.id).finishedAt = '2026-10-05T00:00:00.000Z';
  state.orders.find((order) => order.id === tooOld.id).finishedAt = '2026-10-04T23:59:59.999Z';
  state.orders.find((order) => order.id === otherCustomer.id).finishedAt = '2026-10-05T00:00:00.000Z';
  store.write(state);

  assert.deepEqual(
    store.listCompletedWithinVouchWindow('guild-1', 'user-1', vouchTime).map((order) => order.id),
    [atLimit.id],
  );
});

test('warranty-void notice state persists and can only be marked once', () => {
  const store = createStore();
  const order = store.addOrder({
    guildId: 'guild-1',
    customerId: 'user-1',
    sourceChannelId: 'ticket-1',
    items: 'Latte',
    paymentMethod: 'Cash',
    supporterId: 'staff-1',
    quantity: 1,
  });
  store.finishOrder(order.id, 'completed');

  const markedAt = '2026-10-05T12:00:00.000Z';
  assert.equal(store.markWarrantyVoidNotified(order.id, markedAt).warrantyVoidNotifiedAt, markedAt);
  assert.equal(store.markWarrantyVoidNotified(order.id), null);
  assert.equal(new OrderStore(store.filePath).listCompleted()[0].warrantyVoidNotifiedAt, markedAt);
});

test('vouches suppress warranty-void notices only inside the 12-hour window', () => {
  const store = createStore();
  const from = '2026-10-05T00:00:00.000Z';
  const to = '2026-10-05T12:00:00.000Z';
  store.addVouch({ guildId: 'guild-1', userId: 'user-1', items: 'Latte', createdAt: from });
  assert.equal(store.hasVouchWithinWindow('guild-1', 'user-1', from, to), true);
  assert.equal(store.hasVouchWithinWindow('guild-2', 'user-1', from, to), false);
  assert.equal(store.hasVouchWithinWindow('guild-1', 'user-2', from, to), false);
  assert.equal(store.hasVouchWithinWindow(
    'guild-1',
    'user-1',
    '2026-10-05T00:00:00.001Z',
    to,
  ), false);
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