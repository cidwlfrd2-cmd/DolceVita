function orderStatusLabel(order) {
  if (order.status === 'completed') return 'Complete';
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.processingStatus === 'processing') return 'Processing';
  return 'Noted';
}

module.exports = { orderStatusLabel };
