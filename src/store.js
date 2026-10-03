const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const EMPTY_STATE = { settings: {}, orders: [], vouches: [], stickyMessages: {} };

class OrderStore {
  constructor(filePath = path.join(process.cwd(), 'data', 'orders.json')) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.write(EMPTY_STATE);
  }

  read() {
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  }

  write(state) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }

  getSettings(guildId) {
    return this.read().settings[guildId] ?? null;
  }

  setSettings(guildId, settings) {
    const state = this.read();
    state.settings[guildId] = { ...state.settings[guildId], ...settings };
    this.write(state);
  }

  addVouch({ guildId, userId, items }) {
    const state = this.read();
    state.vouches ??= [];
    const vouch = {
      id: randomUUID().toUpperCase(),
      guildId,
      userId,
      items,
      createdAt: new Date().toISOString(),
    };
    state.vouches.push(vouch);
    this.write(state);
    return vouch;
  }

  listVouches(guildId, userId) {
    const state = this.read();
    return (state.vouches ?? [])
      .filter((vouch) => vouch.guildId === guildId && vouch.userId === userId)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  getStickyMessage(guildId, channelId) {
    return this.read().stickyMessages?.[`${guildId}:${channelId}`] ?? null;
  }

  setStickyMessage(guildId, channelId, content, messageId) {
    const state = this.read();
    state.stickyMessages ??= {};
    const key = `${guildId}:${channelId}`;
    const previous = state.stickyMessages[key] ?? null;
    state.stickyMessages[key] = { guildId, channelId, content, messageId };
    this.write(state);
    return previous;
  }

  removeStickyMessage(guildId, channelId) {
    const state = this.read();
    const key = `${guildId}:${channelId}`;
    const stickyMessage = state.stickyMessages?.[key] ?? null;
    if (!stickyMessage) return null;
    delete state.stickyMessages[key];
    this.write(state);
    return stickyMessage;
  }

  addOrder({ guildId, customerId, sourceChannelId, items, paymentMethod, supporterId, quantity }) {
    const state = this.read();
    const order = {
      id: randomUUID().toUpperCase(),
      guildId,
      customerId,
      sourceChannelId,
      items,
      paymentMethod,
      supporterId,
      quantity,
      status: 'pending',
      processingStatus: 'not_yet',
      createdAt: new Date().toISOString(),
      claimedBy: null,
      channelId: null,
      messageId: null,
    };
    state.orders.push(order);
    this.write(state);
    return order;
  }

  setOrderMessage(orderId, channelId, messageId) {
    const state = this.read();
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return null;
    order.channelId = channelId;
    order.messageId = messageId;
    this.write(state);
    return order;
  }

  getOrder(orderId) {
    return this.read().orders.find((order) => order.id === orderId) ?? null;
  }

  listActive(guildId) {
    return this.read().orders
      .filter((order) => order.guildId === guildId && ['pending', 'claimed'].includes(order.status))
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  }

  claimNext(guildId, staffId) {
    const state = this.read();
    const order = state.orders
      .filter((entry) => entry.guildId === guildId && entry.status === 'pending')
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt))[0];
    if (!order) return null;
    order.status = 'claimed';
    order.claimedBy = staffId;
    this.write(state);
    return order;
  }

  markProcessing(orderId, staffId) {
    const state = this.read();
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !['pending', 'claimed'].includes(order.status)) return null;
    if (order.status === 'pending') {
      order.status = 'claimed';
      order.claimedBy = staffId;
    }
    order.processingStatus = 'processing';
    order.processingBy = staffId;
    this.write(state);
    return order;
  }

  finishOrder(orderId, status) {
    if (!['completed', 'cancelled'].includes(status)) {
      throw new Error(`Unsupported final status: ${status}`);
    }
    const state = this.read();
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !['pending', 'claimed'].includes(order.status)) return null;
    order.status = status;
    order.finishedAt = new Date().toISOString();
    this.write(state);
    return order;
  }
}

module.exports = { OrderStore };