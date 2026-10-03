const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

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
  lines.push('**,botpronouns** — View the saved pronouns for this server.');
  lines.push('**,botpronouns add <pronouns>**, **,botpronouns change <pronouns>**, or **,botpronouns remove** — Manage the bot pronouns for this server (administrator only).');
  lines.push('Ticket close actions post the transcript, then automatically delete the ticket channel.');
  lines.push('**/setupticketcategory <category_id>** or **,setupticketcategory <category id>** — Set the parent category for new tickets (administrator only).');
  lines.push('**,set ticket_transcript <channel id>** — Set the closed-ticket transcript channel (administrator only).');
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
          .setMaxLength(1024),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-quantity')
          .setLabel('QUANTITY')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket-payment-method')
          .setLabel('PAYMENT METHOD')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1024),
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
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel(claimed ? 'Claimed' : 'Claim Ticket')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
  );
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