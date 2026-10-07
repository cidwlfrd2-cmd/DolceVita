function ticketOwnerId(channel) {
  if (!channel?.topic?.match(/(?:^|;)ticket-type:(?:order|report|others)(?:;|$)/)) return null;
  return channel.topic.match(/(?:^|;)ticket-owner:(\d+)(?:;|$)/)?.[1] ?? null;
}

function ticketTermsRequired(channel) {
  return Boolean(channel?.topic?.match(/(?:^|;)ticket-terms-required(?:;|$)/));
}

function ticketTermsAccepted(channel) {
  return Boolean(channel?.topic?.match(/(?:^|;)ticket-terms-accepted(?:;|$)/));
}

function ticketCustomerId(channel, fallbackUserId) {
  return ticketOwnerId(channel) ?? fallbackUserId;
}

async function ticketProduct(channel) {
  if (!channel?.topic?.match(/(?:^|;)ticket-type:order(?:;|$)/)) return null;
  const topicProduct = channel.topic.match(/(?:^|;)ticket-product:([^;]+)(?:;|$)/)?.[1];
  if (topicProduct) return topicProduct;

  const messages = await channel.messages.fetch({ limit: 10 });
  for (const message of messages.values()) {
    const orderTicket = message.embeds.find((embed) => embed.title === 'ORDER TICKET');
    const product = orderTicket?.fields.find((field) => field.name === 'PRODUCT')?.value;
    if (product) return product;
  }
  return null;
}

async function ticketQuantity(channel) {
  if (!channel?.topic?.match(/(?:^|;)ticket-type:order(?:;|$)/)) return null;
  const topicQuantity = channel.topic.match(/(?:^|;)ticket-quantity:(\d+)(?:;|$)/)?.[1];
  if (topicQuantity && Number(topicQuantity) >= 1 && Number(topicQuantity) <= 1000) {
    return Number(topicQuantity);
  }

  const messages = await channel.messages.fetch({ limit: 10 });
  for (const message of messages.values()) {
    const orderTicket = message.embeds.find((embed) => embed.title === 'ORDER TICKET');
    const quantity = orderTicket?.fields.find((field) => field.name === 'QUANTITY')?.value;
    if (/^\d{1,4}$/.test(quantity ?? '') && Number(quantity) >= 1 && Number(quantity) <= 1000) {
      return Number(quantity);
    }
  }
  return null;
}

module.exports = {
  ticketOwnerId,
  ticketTermsRequired,
  ticketTermsAccepted,
  ticketCustomerId,
  ticketProduct,
  ticketQuantity,
};
