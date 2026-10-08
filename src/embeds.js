const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { orderStatusLabel } = require('./order-status');
const { orderReference } = require('./order-reference');

const LABELS = { pending: 'Waiting', claimed: 'In progress', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired' };

function orderContainer(order) {
  const status = order.status === 'completed'
    ? 'done'
    : order.status === 'cancelled'
      ? 'cancelled'
      : order.status === 'expired'
        ? 'expired'
        : order.processingStatus === 'processing' ? 'processing' : 'noted';
  const sourceChannel = order.sourceChannelId ? `<#${order.sourceChannelId}>` : 'Unknown channel';
  const servedBy = order.supporterId ? `<@${order.supporterId}>` : 'Not assigned';
  const item = order.items ?? order.item;
  const quantity = order.quantity ?? 1;
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '_ _',
      ` _ _    🧁   order from ${sourceChannel}`,
      `  _ _     ⤷   ${item} (x${quantity})`,
      `   _ _     ⤷   paid via ${order.paymentMethod ?? 'Not specified'}`,
      `    _ _     ⤷   status: __**${status}**__`,
      `     _ _     ⤷   served by ${servedBy}`,
      '     _ _',
    ].join('\n')))
    .addActionRowComponents(orderButtons(order));
}

function orderStatusEmbed(order) {
  const status = orderStatusLabel(order);
  const colors = { Processing: 0x3478c7, Complete: 0x35a16b, Cancelled: 0xc94c4c };
  return new EmbedBuilder()
    .setColor(colors[status])
    .setTitle('Order Status Update')
    .setDescription(`Your order **#${orderReference(order)}** is now **${status}**.`)
    .addFields(
      { name: 'Items', value: String(order.items ?? order.item), inline: true },
      { name: 'Quantity', value: String(order.quantity), inline: true },
      { name: 'Payment method', value: order.paymentMethod ?? 'Not specified', inline: true },
      { name: 'Submitted in', value: order.sourceChannelId ? `<#${order.sourceChannelId}>` : 'Unknown channel' },
    )
    .setTimestamp();
}

function voidedOrderEmbed(user, product, reason, markedAt = new Date()) {
  const username = user?.username ? `@${user.username}` : '@unknown';
  const userId = user?.id ?? 'unknown';
  const date = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).format(markedAt);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(markedAt);
  return new EmbedBuilder()
    .setColor(0xc94c4c)
    .setTitle('vouch / order voided')
    .setDescription([
      `${user?.id ? `<@${user.id}>` : '@user'} has been marked as **voided**`,
      '',
      '**user**',
      `${username} - ${userId}`,
      '',
      '**product**',
      String(product ?? 'Unknown product'),
      '',
      '**reason**',
      String(reason ?? 'no vouch within 12hours'),
    ].join('\n'))
    .setFooter({ text: `voided by dolce vita - ${date} - ${time}` });
}

function multiplicationContainer({ amountOne, amountTwo, product }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${amountOne} x ${amountTwo} = ${product}**`),
    );
}

function robuxFormContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '🥞   **RBX FILL UP FORM !**',
      '',
      '**username:**',
      '**display name:**',
    ].join('\n')));
}

function openShopContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '@𓏲﹕     dolcezza',
      '_ _',
      ':candy:  **Dolce Vita is now __open__**',
      '',
      'we never serve rush orders.',
      'check our pricelist before ordering.',
      '',
      '→  [Daily Stocks](https://discord.com/channels/1555578509743755306/1555578511165493401)',
      '→  [Robux Via Plus / Gamepass Gift](https://discord.com/channels/1555578509743755306/1555633960523141220)',
      '→  [Discord Items - Dekor & Sv Boost](https://discord.com/channels/1555578509743755306/1555581838544609430)',
      '→  [Premmies](https://discord.com/channels/1555578509743755306/1555826478522835014) - Soon',
      '→  [Gamecredits](https://discord.com/channels/1555578509743755306/1555826478522835014) - Soon',
    ].join('\n')));
}

function closeShopContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '@𓏲﹕     dolcezza',
      '_ _',
      '🔴  **Dolce Vita is now __closed__**',
      '',
      'Thank you for your support. Please check back later!',
    ].join('\n')));
}

function giveawayContainer(giveaway, ended = false) {
  const endTime = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const lines = [
    '🎉 **GIVEAWAY**',
    '',
    `**Prize:** ${giveaway.prize}`,
    `**Host:** <@${giveaway.hostId}>`,
    ended
      ? `**Winners:** ${giveaway.winners?.length ? giveaway.winners.map((id) => `<@${id}>`).join(', ') : 'No eligible entrants.'}`
      : `**Ends:** <t:${endTime}:R>`,
    `**Entries:** ${giveaway.entrants?.length ?? 0}`,
  ];
  if (giveaway.messageCount) {
    lines.push(`**Message requirement:** ${giveaway.messageCount} messages in <#${giveaway.messageChannelId}>`);
  }
  if (giveaway.requirements) lines.push(`**Additional requirements:** ${giveaway.requirements}`);
  if (giveaway.roleIds?.length) {
    lines.push(`**Eligible roles:** ${giveaway.roleIds.map((id) => `<@&${id}>`).join(', ')}`);
  }
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${giveaway.id}`)
        .setLabel(ended ? 'Giveaway ended' : '🎉 Enter giveaway')
        .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(ended),
    ));
}

function paymentReminderEmbed(serverIconUrl) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setDescription('゛ **Dolce Vita payment reminders:**  ⸝⸝   .ᐟ 𑣲\n» send the payment details via screenshot.\n» pls complete your payment within 12hrs.\n» once payment is verified, the order will be processed.\n» no rush of orders!\n» pls click `pay` to proceed, `no` to cancel.');
  if (serverIconUrl) embed.setThumbnail(serverIconUrl);
  return embed;
}

function vouchEmbed(user, items, feedback, vouchedAt = new Date()) {
  const date = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
    timeZoneName: 'short',
  }).format(vouchedAt);
  return new EmbedBuilder()
    .setColor(0x35a16b)
    .addFields(
      { name: '✨ • order details', value: `**buyer:** <@${user.id}>`, inline: false },
      { name: '🔹 item', value: items, inline: false },
      { name: '🔹 date vouched', value: date, inline: false },
      { name: '🔹 feedback', value: feedback, inline: false },
      { name: '🔹 proof', value: 'See the attached proof image below.', inline: false },
    );
}

function orderCompletionReminderEmbed() {
  return new EmbedBuilder()
    .setColor(0x35a16b)
    .setDescription([
      '**REMINDERS : WARRANTY POLICY!!**',
      '› All completed orders come with a 12-hours warranty.',
      '› Replacements will only be provided for verified issues covered by warranty.',
      '› Once the warranty expires, the shop is no longer responsible for issues covered by the expired warranty.',
      '› NO VOUCH = no refund, no replacement & no warranty.',
    ].join('\n'));
}

function paymentDetailsEmbed() {
  return new EmbedBuilder()
    .setColor(0x3478c7)
    .setDescription('**🧁 payment method: gcash**\ngcash initials: H. C. S.\ngcash number: `09639298459`\npls send screenshot of the receipt, ty!')
    .setImage('attachment://gcash-payment.png');
}

function paymentReminderButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('payment:yes')
      .setLabel('pay')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('payment:no')
      .setLabel('no')
      .setStyle(ButtonStyle.Danger),
  );
}

function vouchPreviewButtons(previewId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vouch-preview:confirm:${previewId}`)
      .setLabel('Confirm vouch')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`vouch-preview:change:${previewId}`)
      .setLabel("No, I'll change it")
      .setStyle(ButtonStyle.Secondary),
  );
}

function orderButtons(order) {
  const active = ['pending', 'claimed'].includes(order.status);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order:processing:${order.id}`)
      .setLabel('processing')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!active || order.processingStatus === 'processing'),
    new ButtonBuilder()
      .setCustomId(`order:complete:${order.id}`)
      .setLabel('complete')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!active),
    new ButtonBuilder()
      .setCustomId(`order:cancel:${order.id}`)
      .setLabel('cancelled')
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
      name: `#${orderReference(order)} - ${LABELS[order.status]}`,
      value: `**${order.items ?? order.item}** x ${order.quantity} - <@${order.customerId}>`,
      inline: false,
    });
  }
  if (orders.length > 25) embed.setFooter({ text: 'Showing the first 25 active orders.' });
  return embed;
}

function helpEmbed(commands) {
  const lines = ['## Slash commands'];
  for (const command of commands) {
    const subcommands = command.options?.filter((option) => option.type === 1) ?? [];
    if (subcommands.length) {
      for (const subcommand of subcommands) {
        lines.push(`**/${command.name} ${subcommand.name}** — ${subcommand.description}`);
      }
      continue;
    }

    const options = command.options?.map((option) => (
      option.required ? `<${option.name}>` : `[${option.name}]`
    )) ?? [];
    lines.push(`**/${command.name}${options.length ? ` ${options.join(' ')}` : ''}** — ${command.description}`);
  }
  lines.push('', '## Message shortcuts');
  lines.push('**,calc <number>*<number>** — Multiply two numbers, then automatically delete the command message.');
  lines.push('', '## Ticket notes');
  lines.push('Claimed tickets can be unclaimed only by the current claimant, allowing another authorized staff member to claim the ticket.');
  lines.push('Ticket close actions require a reason, post it in the transcript, then automatically delete the ticket channel.');

  return new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle('Bot Commands')
    .setDescription(lines.join('\n'));
}

function ticketPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:order')
      .setLabel('order')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:report')
      .setLabel('report')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:others')
      .setLabel('others')
      .setStyle(ButtonStyle.Secondary),
  );
}

function orderTicketModal() {
  return new ModalBuilder()
    .setCustomId('ticket:order-form')
    .setTitle('ORDER FORM')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-product')
          .setLabel('PRODUCT')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1024)
          .setPlaceholder('DEKOR / GAMECREDITS / SVBOOST / ROBUX'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-quantity')
          .setLabel('QUANTITY')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setPlaceholder('1-9999'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-payment-method')
          .setLabel('PAYMENT METHOD')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1024)
          .setPlaceholder('GCASH / BANKTRANS / PAYMAYA'),
      ),
    );
}

function reportTicketModal() {
  return new ModalBuilder()
    .setCustomId('ticket:report-form')
    .setTitle('REPORT FORM')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-report-product')
          .setLabel('WHAT IS THE PRODUCT YOU BOUGHT?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1024),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-report-issue')
          .setLabel('WHAT IS THE ISSUE ABOUT IT?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1024),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-report-rules')
          .setLabel('DID YOU READ THE RULES?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
}

function othersTicketModal() {
  return new ModalBuilder()
    .setCustomId('ticket:others-form')
    .setTitle('PARTNERSHIP / CONCERN')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-others-message')
          .setLabel('PARTNERSHIP / CONCERN')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('Type PARTNERSHIP or CONCERN'),
      ),
    );
}

function ticketEmbed(type, user, orderForm, reportForm, othersForm) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle(`${type.toUpperCase()} TICKET`)
    .setDescription(`Hello <@${user.id}>. A staff member will be with you shortly.`);

  if (orderForm) {
    embed.addFields(
      { name: 'PRODUCT', value: orderForm.product },
      { name: 'QUANTITY', value: orderForm.quantity },
      { name: 'PAYMENT METHOD', value: orderForm.paymentMethod },
    );
  }
  if (reportForm) {
    embed.addFields(
      { name: 'WHAT IS THE PRODUCT YOU BOUGHT?', value: reportForm.product },
      { name: 'WHAT IS THE ISSUE ABOUT IT?', value: reportForm.issue },
      { name: 'DID YOU READ THE RULES?', value: reportForm.readRules },
    );
  }
  if (othersForm) {
    embed.addFields({ name: 'PARTNERSHIP / CONCERN', value: othersForm.type });
  }
  return embed;
}

function ticketButtons(claimed = false) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel(claimed ? 'Claimed' : 'Claim Ticket')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),
  ];
  if (claimed) {
    buttons.push(new ButtonBuilder()
      .setCustomId('ticket:unclaim')
      .setLabel('Unclaim Ticket')
      .setStyle(ButtonStyle.Secondary));
  }
  buttons.push(new ButtonBuilder()
    .setCustomId('ticket:close')
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger));
  return new ActionRowBuilder().addComponents(...buttons);
}

function ticketCloseConfirmationEmbed(channel) {
  return new EmbedBuilder()
    .setColor(0xe6a23c)
    .setTitle('Confirm Ticket Closure')
    .setDescription(`Are you sure you want to close ${channel}?`);
}

function ticketCloseConfirmationButtons(confirmationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket-close:confirm:${confirmationId}`)
      .setLabel('Confirm Close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket-close:cancel:${confirmationId}`)
      .setLabel("No, don't close")
      .setStyle(ButtonStyle.Secondary),
  );
}

function ticketCloseReasonModal(confirmationId) {
  return new ModalBuilder()
    .setCustomId(`ticket-close-reason:${confirmationId}`)
    .setTitle('Ticket Closure Reason')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-close-reason')
          .setLabel('Why are you closing this ticket?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setPlaceholder('Enter the reason for closing this ticket'),
      ),
    );
}

function ticketTranscriptEmbed({
  channelId,
  createdAt,
  ownerId,
  closedById,
  claimedById,
  reason = 'done',
}) {
  return new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle('Ticket Closed')
    .addFields(
      { name: '🔢 Ticket ID', value: channelId, inline: true },
      { name: '✅ Opened By', value: `<@${ownerId}>`, inline: true },
      { name: '🔒 Closed By', value: `<@${closedById}>`, inline: true },
      { name: '🕒 Open Time', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:f>`, inline: true },
      { name: '🟣 Claimed By', value: claimedById ? `<@${claimedById}>` : 'Unclaimed', inline: true },
      { name: '❔ Reason', value: reason, inline: true },
    )
    .setTimestamp();
}

module.exports = {
  orderButtons,
  orderContainer,
  orderStatusEmbed,
  voidedOrderEmbed,
  orderCompletionReminderEmbed,
  multiplicationContainer,
  robuxFormContainer,
  openShopContainer,
  closeShopContainer,
  giveawayContainer,
  paymentReminderEmbed,
  vouchEmbed,
  paymentDetailsEmbed,
  paymentReminderButtons,
  vouchPreviewButtons,
  orderTicketModal,
  othersTicketModal,
  helpEmbed,
  queueEmbed,
  reportTicketModal,
  ticketButtons,
  ticketCloseConfirmationEmbed,
  ticketCloseConfirmationButtons,
  ticketCloseReasonModal,
  ticketEmbed,
  ticketPanelButtons,
  ticketTranscriptEmbed,
};