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
    orderButtons(order).toJSON().components.map((button) => button.custom_id),
    [
      `order:processing:${order.id}`,
      `order:complete:${order.id}`,
      `order:cancel:${order.id}`,
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
  assert.equal(completedEmbed.fields.find((field) => field.name === 'Status').value, 'Completed');
  const cancelledEmbed = orderEmbed({ ...order, status: 'cancelled' }).toJSON();
  assert.equal(cancelledEmbed.fields.find((field) => field.name === 'Status').value, 'Cancelled');
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

  assert.equal(embed.fields.find((field) => field.name === 'Status').value, 'Noted');
  assert.match(embed.description, /\*\*Customer By:\*\* <@customer-1>/);
  assert.match(embed.description, /\*\*Served by:\*\* <@staff-1>/);

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
  assert.match(missingOwnerEmbed.description, /\*\*Customer By:\*\* Unknown customer/);
  assert.match(missingOwnerEmbed.description, /\*\*Served by:\*\* Not assigned/);
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