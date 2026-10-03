const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const COLORS = { pending: 0x3478c7, claimed: 0xe6a23c, completed: 0x35a16b, cancelled: 0xc94c4c };
const LABELS = { pending: 'Waiting', claimed: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

function orderEmbed(order) {
  const status = order.status === 'completed'
    ? 'Completed'
    : order.status === 'cancelled'
      ? 'Cancelled'
      : order.processingStatus === 'processing' ? 'Processing' : 'Not yet';
  const embed = new EmbedBuilder()
    .setColor(COLORS[order.status])
    .setDescription(`**Items:** ${order.items ?? order.item}\n**Quantity:** ${order.quantity}\n**Payment method:** ${order.paymentMethod ?? 'Not specified'}\n**Customer:** <@${order.customerId}>\n**Supporter:** ${order.supporterId ? `<@${order.supporterId}>` : 'Not assigned'}\n**Order submitted in:** ${order.sourceChannelId ? `<#${order.sourceChannelId}>` : 'Unknown channel'}`)
    .addFields({
      name: 'Status',
      value: status,
      inline: true,
    });

  if (order.claimedBy) embed.addFields({ name: 'Claimed by', value: `<@${order.claimedBy}>`, inline: true });
  if (order.processingBy) embed.addFields({ name: 'Processing by', value: `<@${order.processingBy}>`, inline: true });
  embed.setTimestamp(new Date(order.createdAt));
  return embed;
}

function orderButtons(order) {
  const active = ['pending', 'claimed'].includes(order.status);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order:processing:${order.id}`)
      .setLabel('Processing')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!active || order.processingStatus === 'processing'),
    new ButtonBuilder()
      .setCustomId(`order:complete:${order.id}`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!active),
    new ButtonBuilder()
      .setCustomId(`order:cancel:${order.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!active),
  );
}

function queueEmbed(orders) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle('Public Order Queue')
    .setDescription(orders.length ? `${orders.length} active order${orders.length === 1 ? '' : 's'}` : 'There are no active orders.');

  for (const order of orders.slice(0, 25)) {
    embed.addFields({
      name: `#${order.id} - ${LABELS[order.status]}`,
      value: `**${order.items ?? order.item}** x ${order.quantity} - <@${order.customerId}>`,
      inline: false,
    });
  }
  if (orders.length > 25) embed.setFooter({ text: 'Showing the first 25 active orders.' });
  return embed;
}

module.exports = { orderButtons, orderEmbed, queueEmbed };