function orderReference(order) {
  return order.ticketProduct || order.id;
}

module.exports = { orderReference };
