const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { orderStatusLabel } = require('./order-status');
const { orderReference } = require('./order-reference');

const LABELS = { pending: 'Waiting', claimed: 'In progress', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired' };
const SHOP_ANNOUNCEMENT_ROLE_ID = '1555603985694588940';

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

function dmsUserContainer(guildName, reply) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## Message from ${guildName}`,
      reply,
    ].join('\n\n')));
}

function messageContainer(text) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

function openShopContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `<@&${SHOP_ANNOUNCEMENT_ROLE_ID}>`,
      '_ _',
      ':candy:  **Dolce Vita is now __open__**',
      '',
      'we never server rush orders.',
      'check our pricelist before ordering.',
      '',
      '→  [Daily Stocks](https://discord.com/channels/1555578509743755306/1555578511165493401)',
      '→  [Robux Via Plus / Gamepass Gift](https://discord.com/channels/1555578509743755306/1555633960523141220)',
      '→  [Discord Items - Dekor & Sv Boost](https://discord.com/channels/1555578509743755306/1555581838544609430)',
      '→  [Premmies](https://discord.com/channels/1555578509743755306/1555826478522835014) - Soon',
      '→  [Gamecredits](https://discord.com/channels/1555578509743755306/1555826478522835014) - Soon',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Order Here')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/1555578509743755306/1555625940111855697'),
    ));
}

function closeShopContainer() {
  return new ContainerBuilder()
    .setAccentColor(0x3478c7)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '_ _',
      ':candy:   **Dolce Vita is now closed**',
      '',
      'Thank you to everyone who supported Dolce Vita,',
      'We appreciate all of you.',
      '',
      'we\'re currently closed but you still can create a ticket',
      '',
      'if you create a ticket while closed please wait for',
      'Dolce Vita Staff to open the shop and assist you.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '⟢ please keep an eye on our [Announcement](https://discord.com/channels/1555578509743755306/1555826478522835014) channel for updates on our next opening.',
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '**what happened?**',
      '> we\'re busy/sleeping or at school/work, and improving our services',
      '> to serve y\'all better',
    ].join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '**what can I do?**',
      '→ [check the pricelist](https://discord.com/channels/1555578509743755306/1555581838544609430)',
      '→ [check the rules](https://discord.com/channels/1555578509743755306/1556310915643867226)',
      '→ [inquire channel](https://discord.com/channels/1555578509743755306/1555592238690598943)',
    ].join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      'thank you for patience and understanding. See you soon!!',
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Announcement')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/1555578509743755306/1555826478522835014'),
    ));
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

function warrantyVoidedContainer(order) {
  const user = `<@${order.customerId}>`;
  const userId = String(order.customerId ?? 'unknown');
  const product = `${order.ticketProduct ?? order.items ?? order.item ?? 'Unknown product'} (x${order.quantity ?? 1})`;
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '_ _',
      '_ _      ᨳଓ warranty voided',
      `_ _       ${user} has been revoked the **warranty**`,
      '_ _',
      '_ _       **user**',
      `_ _        ⧽ ${user} | ${userId}`,
      '_ _',
      '_ _       **item**',
      `_ _        ⧽ ${product}`,
      '_ _',
      '_ _       **reason**',
      '_ _        ⧽ No Vouch = Warranty Voided',
      '_ _',
    ].join('\n')));
}

function voidedRoleRemovedContainer(userId) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `<@${userId}> voided role was removed because they submitted a vouch within 12 hours.`,
    ));
}

function giveawayContainer(giveaway, ended = false) {
  const endsAt = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const details = [
    `## 🎉 ${ended ? 'Giveaway Ended' : 'Giveaway'}`,
    `**Prize:** ${giveaway.prize}`,
    `**Host:** <@${giveaway.hostId}>`,
    `**Winners:** ${giveaway.winnerCount}`,
    `**Entries:** ${giveaway.entrants.length}`,
    ended ? '**Status:** Ended' : `**Ends:** <t:${endsAt}:R>`,
  ];
  if (giveaway.messageRequirements) details.push(`**Requirements:** ${giveaway.messageRequirements}`);
  if (giveaway.messageCount && giveaway.messageChannelId) {
    details.push(`Join requires ${giveaway.messageCount} tracked messages in <#${giveaway.messageChannelId}>.`);
  }
  if (giveaway.overrideRoleIds?.length) {
    details.push(`Only members with ${giveaway.overrideRoleIds.map((roleId) => `<@&${roleId}>`).join(' or ')} may join.`);
  }
  if (ended) {
    details.push(giveaway.winners.length
      ? `**Winner${giveaway.winners.length === 1 ? '' : 's'}:** ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`
      : '**Winner:** No eligible entrants.');
  }
  const joinButton = new ButtonBuilder()
    .setCustomId(`giveaway:join:${giveaway.id}`)
    .setLabel('Join Giveaway')
    .setEmoji('🎉')
    .setStyle(ButtonStyle.Success)
    .setDisabled(ended);
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(joinButton));
}

function giveawayWinnersContainer(giveaway, winnerIds) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## 🎉 Giveaway Reroll: ${giveaway.prize}`,
      winnerIds.length
        ? `**New winner${winnerIds.length === 1 ? '' : 's'}:** ${winnerIds.map((id) => `<@${id}>`).join(', ')}`
        : 'No new eligible entrants are available.',
    ].join('\n')));
}

function multiplicationEmbed({ amountOne, amountTwo, product }) {
  return new EmbedBuilder()
    .setColor(0x3478c7)
    .setDescription(`**${amountOne} x ${amountTwo} = ${product}**`);
}

function multiplicationContainer({ amountOne, amountTwo, product }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder()
      .setContent(`**${amountOne} x ${amountTwo} = ${product}**`));
}

function paymentReminderEmbed(serverIconUrl) {
  const embed = new EmbedBuilder()
    .setColor(0x3478c7)
    .setDescription('゛ **Dolce Vita payment reminders:**  ⸝⸝   .ᐟ 𑣲\n» send the payment details via screenshot.\n» pls complete your payment within 12hrs.\n» once payment is verified, the order will be processed.\n» no rush of orders!\n» pls click `pay` to proceed, `no` to cancel.');
  if (serverIconUrl) embed.setThumbnail(serverIconUrl);
  return embed;
}

function formatVouchDate(vouchedAt) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(vouchedAt) + ' PHT (UTC+8)';
}

function vouchEmbed(user, items, feedback, vouchedAt = new Date()) {
  return new EmbedBuilder()
    .setColor(0x35a16b)
    .addFields(
      { name: '✨ • order details', value: `**buyer:** <@${user.id}>`, inline: false },
      { name: '🔹 item', value: items, inline: false },
      { name: '🔹 date vouched', value: formatVouchDate(vouchedAt), inline: false },
      { name: '🔹 feedback', value: feedback, inline: false },
      { name: '🔹 proof', value: 'See the attached proof image below.', inline: false },
    );
}

function warrantyActivatedContainer(userId, items, vouchedAt = new Date()) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '<:blank:1557365898216611841>        <a:vitacheck:1557378165457027072>    **WARRANTY ACTIVATED *!***',
      '_ _',
      '        ⧽ applies only to (nitro, premium subs, svboosts)',
      '        ⧽ you may ignore this if you purchased discord items',
      '        ⧽ present this if your item gets **revoked**',
      '_ _',
      '-# _ _     Deleting this message will automatically void the warranty',
      '',
      '════════════════════════',
      '<:suchiblank:1406916898201010217>  ',
      '<:suchiblank:1406916898201010217> 🍩   **order details**',
      '',
      '୭ ˚. ᵎᵎ **buyer: **',
      `         ⧽ <@${userId}>`,
      '୭ ˚. ᵎᵎ  item:',
      `         ⧽ ${items}`,
      '୭ ˚. ᵎᵎ  date vouched:',
      `         ⧽ ${formatVouchDate(vouchedAt)}`,
      '୭ ˚. ᵎᵎ  proof:',
    ].join('\n')))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://vouch-proofs.png'),
    ));
}

function orderCompletionReminderContainer(orderId) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '**REMINDERS : WARRANTY POLICY!!**',
      '› All completed orders come with a 12-hours warranty.',
      '› Replacements will only be provided for verified issues covered by warranty.',
      '› Once the warranty expires, the shop is no longer responsible for issues covered by the expired warranty.',
      '› vouch within 12 hrs αfter clαiming order.',
      '› NO VOUCH = no refund, no replacement & no warranty.',
    ].join('\n')))
    .addActionRowComponents(orderVouchButton(orderId));
}

function orderVouchInstructionContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder()
      .setContent('TYPE `/vouch` TO VOUCH DOLCE VITA, THANKYOU!!'));
}

function orderVouchButton(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order:vouch:${orderId}`)
      .setLabel('Vouch')
      .setStyle(ButtonStyle.Success),
  );
}

function orderVouchModal(orderId) {
  return new ModalBuilder()
    .setCustomId(`order-vouch-form:${orderId}`)
    .setTitle('VOUCH FORM')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Product')
        .setDescription('Enter one: DEKOR / GAMECREDITS / SVBOOST / ROBUX')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('order-vouch-product')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('ENTER ONE: DEKOR / GAMECREDITS / SVBOOST / ROBUX')),
      new LabelBuilder()
        .setLabel('Feedback')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('order-vouch-feedback')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1024)),
      new LabelBuilder()
        .setLabel('Proof')
        .setDescription('Upload 1-2 proof images.')
        .setFileUploadComponent(new FileUploadBuilder()
          .setCustomId('order-vouch-proof')
          .setMinValues(1)
          .setMaxValues(2)
          .setRequired(true)),
    );
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
  lines.push('', '## Message commands');
  lines.push('**,calc <number>*<number>** — Multiply two numbers, then automatically delete the command message.');

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
          .setPlaceholder('ENTER ONE: DEKOR / GAMECREDITS / SVBOOST / ROBUX'),
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

function orderTicketTermsContainer(accepted = false) {
  const button = new ButtonBuilder()
    .setCustomId('ticket:terms-agree')
    .setLabel(accepted ? 'Terms accepted' : 'I agree to the terms')
    .setStyle(ButtonStyle.Success)
    .setDisabled(accepted);
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      "🧁  ֹ **dolce vita's terms of service** 𓂅 ̼",
      'all sweeties bought are final and non-refundable.',
      '────୨ৎ────────୨ৎ────────୨ৎ────────୨ৎ───────',
      '» Force refunds are not accepted.',
      '» No cancellation or requesting refunds when order status is processing.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(button));
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
  SHOP_ANNOUNCEMENT_ROLE_ID,
  dmsUserContainer,
  messageContainer,
  openShopContainer,
  closeShopContainer,
  orderStatusEmbed,
  warrantyVoidedContainer,
  voidedRoleRemovedContainer,
  giveawayContainer,
  giveawayWinnersContainer,
  orderCompletionReminderContainer,
  orderVouchInstructionContainer,
  orderVouchButton,
  orderVouchModal,
  multiplicationEmbed,
  multiplicationContainer,
  paymentReminderEmbed,
  vouchEmbed,
  warrantyActivatedContainer,
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
  orderTicketTermsContainer,
};