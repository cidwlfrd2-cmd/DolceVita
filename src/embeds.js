const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { orderStatusLabel } = require('./order-status');
const { orderReference } = require('./order-reference');

const COLORS = { pending: 0x3478c7, claimed: 0xe6a23c, completed: 0x35a16b, cancelled: 0xc94c4c };
const LABELS = { pending: 'Waiting', claimed: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

function orderEmbed(order) {
  const status = order.status === 'completed'
    ? 'Completed'
    : order.status === 'cancelled'
      ? 'Cancelled'
        : order.processingStatus === 'processing' ? 'Processing' : 'Noted';
  const embed = new EmbedBuilder()
    .setColor(COLORS[order.status])
    .setDescription(`**Items:** ${order.items ?? order.item}\n**Quantity:** ${order.quantity}\n**Payment method:** ${order.paymentMethod ?? 'Not specified'}\n**Customer:** <@${order.customerId}>\n**Served by:** ${order.supporterId ? `<@${order.supporterId}>` : 'Not assigned'}\n**Order submitted in:** ${order.sourceChannelId ? `<#${order.sourceChannelId}>` : 'Unknown channel'}`)
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

function multiplicationEmbed({ amountOne, amountTwo, product }) {
  return new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle('Multiplication Result')
    .setDescription(`**${amountOne} × ${amountTwo} = ${product}**`);
}

function paymentReminderEmbed(serverIconUrl) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setDescription('゛ **Dolce Vita payment reminders:**  ⸝⸝   .ᐟ 𑣲\n» send the payment details via screenshot.\n» pls complete your payment within 12hrs.\n» once payment is verified, the order will be processed.\n» no rush of orders!\n» pls click `pay` to proceed, `no` to cancel.');
  if (serverIconUrl) embed.setThumbnail(serverIconUrl);
  return embed;
}

function vouchEmbed(user, items, feedback) {
  return new EmbedBuilder()
    .setColor(0x35a16b)
    .setTitle('Customer Vouch')
    .setDescription([
      '## WARRANTY SLIP',
      '**: Applies only to** `NITRO, PREMSUBS, BOOSTS`',
      '**: Ignore this if you purchased** `ROBUX, GAMECREDITS`',
      '**: Show this warranty if your item get revoked**',
    ].join('\n'))
    .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'Items', value: items },
      { name: 'Feedback', value: feedback },
    )
    .setTimestamp();
}

function orderCompletionReminderEmbed() {
  return new EmbedBuilder()
    .setColor(0x35a16b)
    .setDescription([
      '**REMINDERS : WARRANTY POLICY!!**',
      '› All completed orders come with a 12-hours warranty.',
      '› Replacements will only be provided for verified issues covered by warranty.',
      '› Once the warranty expires, the shop is no longer responsible for issues covered by the expired warranty.',
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
      name: `#${orderReference(order)} - ${LABELS[order.status]}`,
      value: `**${order.items ?? order.item}** x ${order.quantity} - <@${order.customerId}>`,
      inline: false,
    });
  }
  if (orders.length > 25) embed.setFooter({ text: 'Showing the first 25 active orders.' });
  return embed;
}

function helpEmbed(commands) {
  const lines = [];
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
  lines.push('**,ticketsetup** — Post the ticket panel in this channel (administrator only).');
  lines.push('**,payment** — Show the Dolce Vita payment reminders.');
  lines.push('**,solving <number> <number>** — Multiply two numbers, then automatically delete the command message.');
  lines.push('Claimed tickets can be unclaimed only by the current claimant, allowing another authorized staff member to claim the ticket.');
  lines.push('Ticket close actions post the transcript, then automatically delete the ticket channel.');
  lines.push('**/setupticketcategory <category_id>** or **,setupticketcategory <category id>** — Set the parent category for new tickets (administrator only).');
  lines.push('**,set ticket_transcript <channel id>** — Set the closed-ticket transcript channel (administrator only).');
  lines.push('**,setvoided <channel id>** — Set the voided-order alert channel (administrator only).');
  lines.push('**,setvoidedrole <role_id>** — Set the role granted to members marked as voided (administrator only).');
  lines.push('**,help** — Show this command list.');

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
      .setStyle(ButtonStyle.Primary),
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
          .setPlaceholder('DEKOR / GAMECREDITS / ROBUX'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-quantity')
          .setLabel('QUANTITY')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setPlaceholder('1-1000'),
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
          .setLabel('Tell us about your partnership or concern')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1024),
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
    embed.addFields({ name: 'PARTNERSHIP / CONCERN', value: othersForm.message });
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

function ticketTranscriptEmbed({
  channelId,
  channelName,
  ownerId,
  closedById,
  claimedById,
  messageCount,
  transcriptPreview,
}) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setTitle('Ticket Transcript')
    .setDescription([
      `Transcript from **#${channelName}**. The complete conversation is attached as a text file.`,
      '',
      transcriptPreview ? `**Recent conversation excerpt:**\n${transcriptPreview}` : '',
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: 'Ticket', value: `<#${channelId}>`, inline: true },
      { name: 'Opened by', value: `<@${ownerId}>`, inline: true },
      { name: 'Closed by', value: `<@${closedById}>`, inline: true },
      { name: 'Messages', value: String(messageCount), inline: true },
    )
    .setTimestamp();
  if (claimedById) embed.addFields({ name: 'Claimed by', value: `<@${claimedById}>`, inline: true });
  return embed;
}

module.exports = {
  orderButtons,
  orderEmbed,
  orderStatusEmbed,
  voidedOrderEmbed,
  orderCompletionReminderEmbed,
  multiplicationEmbed,
  paymentReminderEmbed,
  vouchEmbed,
  paymentDetailsEmbed,
  paymentReminderButtons,
  orderTicketModal,
  othersTicketModal,
  helpEmbed,
  queueEmbed,
  reportTicketModal,
  ticketButtons,
  ticketEmbed,
  ticketPanelButtons,
  ticketTranscriptEmbed,
};