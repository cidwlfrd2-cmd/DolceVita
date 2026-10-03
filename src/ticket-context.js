function ticketOwnerId(channel) {
  if (!channel?.topic?.match(/(?:^|;)ticket-type:(?:order|report|others)(?:;|$)/)) return null;
  return channel.topic.match(/(?:^|;)ticket-owner:(\d+)(?:;|$)/)?.[1] ?? null;
}

module.exports = { ticketOwnerId };
