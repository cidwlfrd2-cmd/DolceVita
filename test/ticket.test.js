const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags } = require('discord.js');
const {
  orderTicketModal,
  warrantyVoidedContainer,
  ticketPanelButtons,
  ticketEmbed,
  ticketButtons,
  reportTicketModal,
  othersTicketModal,
  ticketTranscriptEmbed,
  ticketCloseConfirmationEmbed,
  ticketCloseConfirmationButtons,
  ticketCloseReasonModal,
  helpEmbed,
  multiplicationEmbed,
  multiplicationContainer,
  paymentReminderEmbed,
  vouchEmbed,
  vouchPreviewButtons,
  paymentDetailsEmbed,
  paymentReminderButtons,
  orderCompletionReminderContainer,
  orderVouchButton,
  orderVouchModal,
  orderTicketTermsContainer,
} = require('../src/embeds');
const commands = require('../src/commands');
const { ticketChannelName } = require('../src/ticket-names');
const {
  ticketOwnerId,
  ticketTermsRequired,
  ticketTermsAccepted,
  ticketCustomerId,
  ticketProduct,
} = require('../src/ticket-context');
const { findActiveTicket, withTicketCreationLock } = require('../src/ticket-creation');
const { ticketTranscriptText } = require('../src/ticket-transcript');
const { parseTicketMessageCommand } = require('../src/ticket-message-commands');
const {
  ticketAccessRoleIds,
  ticketManagerRoleIds,
  ticketManagerMentionPayload,
} = require('../src/ticket-permissions');
const { parseOrderTicketForm } = require('../src/order-ticket-form');
const { parseOthersTicketForm } = require('../src/others-ticket-form');
const { multiplyAmounts, multiplyExpression } = require('../src/multiplication');
const { replyThenDeleteCommand } = require('../src/message-command-actions');

test('ticket panel contains only the three requested buttons', () => {
  const buttons = ticketPanelButtons().toJSON().components;
  assert.deepEqual(buttons.map((button) => button.label), ['order', 'report', 'others']);
  assert.equal(buttons[0].style, buttons[1].style);
  assert.equal(buttons[0].style, buttons[2].style);
});

test('order ticket modal requires the product, quantity, and payment method fields', () => {
  const modal = orderTicketModal().toJSON();
  assert.equal(modal.title, 'ORDER FORM');
  assert.deepEqual(
    modal.components.map((row) => ({
      label: row.components[0].label,
      required: row.components[0].required,
    })),
    [
      { label: 'PRODUCT', required: true },
      { label: 'QUANTITY', required: true },
      { label: 'PAYMENT METHOD', required: true },
    ],
  );
  assert.deepEqual(
    modal.components.map((row) => row.components[0].placeholder),
    ['DEKOR / GAMECREDITS / ROBUX', '1-1000', 'GCASH / BANKTRANS / PAYMAYA'],
  );
});

test('order ticket form accepts only listed products and payment methods with quantities from 1 to 1000', () => {
  assert.deepEqual(parseOrderTicketForm({
    product: 'gamecredits',
    quantity: '0007',
    paymentMethod: 'gcash',
  }), {
    value: { product: 'GAMECREDITS', quantity: '7', paymentMethod: 'GCASH' },
  });
  assert.deepEqual(parseOrderTicketForm({
    product: 'DEKOR',
    quantity: '1000',
    paymentMethod: 'PAYMAYA',
  }), {
    value: { product: 'DEKOR', quantity: '1000', paymentMethod: 'PAYMAYA' },
  });
  assert.deepEqual(parseOrderTicketForm({
    product: 'OTHER',
    quantity: '3',
    paymentMethod: 'GCASH',
  }), { error: 'PRODUCT must be DEKOR, GAMECREDITS, or ROBUX.' });
  assert.deepEqual(parseOrderTicketForm({
    product: 'ROBUX',
    quantity: '1001',
    paymentMethod: 'GCASH',
  }), { error: 'QUANTITY must be a whole number from 1 to 1000.' });
  assert.deepEqual(parseOrderTicketForm({
    product: 'ROBUX',
    quantity: '1.5',
    paymentMethod: 'GCASH',
  }), { error: 'QUANTITY must be a whole number from 1 to 1000.' });
  assert.deepEqual(parseOrderTicketForm({
    product: 'ROBUX',
    quantity: '3',
    paymentMethod: 'CARD',
  }), { error: 'PAYMENT METHOD must be GCASH, BANKTRANS, or PAYMAYA.' });
});

test('report ticket modal requires the product, issue, and rules confirmation', () => {
  const modal = reportTicketModal().toJSON();
  assert.equal(modal.title, 'REPORT FORM');
  assert.deepEqual(
    modal.components.map((row) => ({
      label: row.components[0].label,
      required: row.components[0].required,
    })),
    [
      { label: 'WHAT IS THE PRODUCT YOU BOUGHT?', required: true },
      { label: 'WHAT IS THE ISSUE ABOUT IT?', required: true },
      { label: 'DID YOU READ THE RULES?', required: true },
    ],
  );
});

test('others ticket modal requires a partnership or concern description', () => {
  const modal = othersTicketModal().toJSON();
  assert.equal(modal.title, 'PARTNERSHIP / CONCERN');
  assert.equal(modal.components.length, 1);
  assert.deepEqual(
    {
      label: modal.components[0].components[0].label,
      placeholder: modal.components[0].components[0].placeholder,
      required: modal.components[0].components[0].required,
    },
    {
      label: 'PARTNERSHIP / CONCERN',
      placeholder: 'Type PARTNERSHIP or CONCERN',
      required: true,
    },
  );
});

test('others ticket form accepts only partnership or concern', () => {
  assert.deepEqual(parseOthersTicketForm({ type: ' partnership ' }), {
    value: { type: 'PARTNERSHIP' },
  });
  assert.deepEqual(parseOthersTicketForm({ type: 'Concern' }), {
    value: { type: 'CONCERN' },
  });
  assert.deepEqual(parseOthersTicketForm({ type: 'question' }), {
    error: 'Please enter exactly PARTNERSHIP or CONCERN.',
  });
  assert.deepEqual(parseOthersTicketForm({ type: '' }), {
    error: 'Please enter exactly PARTNERSHIP or CONCERN.',
  });
});

test('order ticket embed includes the submitted form answers', () => {
  const embed = ticketEmbed('order', { id: 'user-1' }, {
    product: 'Latte',
    quantity: '2',
    paymentMethod: 'Card',
  }).toJSON();

  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [
      ['PRODUCT', 'Latte'],
      ['QUANTITY', '2'],
      ['PAYMENT METHOD', 'Card'],
    ],
  );
});

test('order ticket terms are shown in a V2 container with the agreement button inside', () => {
  const container = orderTicketTermsContainer().toJSON();
  assert.equal(container.type, 17);
  assert.deepEqual(container.components[0].content.split('\n'), [
    "🧁  ֹ **dolce vita's terms of service** 𓂅 ̼",
    'all sweeties bought are final and non-refundable.',
    '────୨ৎ────────୨ৎ────────୨ৎ────────୨ৎ───────',
    '» Force refunds are not accepted.',
    '» No cancellation or requesting refunds when order status is processing.',
  ]);
  assert.equal(container.components[1].type, 1);
  const button = container.components[1].components[0];
  assert.equal(button.custom_id, 'ticket:terms-agree');
  assert.equal(button.label, 'I agree to the terms');

  const acceptedButton = orderTicketTermsContainer(true).toJSON().components[1].components[0];
  assert.equal(acceptedButton.label, 'Terms accepted');
  assert.equal(acceptedButton.disabled, true);
});

test('report ticket embed includes all submitted report form answers', () => {
  const embed = ticketEmbed('report', { id: 'user-1' }, undefined, {
    product: 'Latte',
    issue: 'Wrong order',
    readRules: 'Yes',
  }).toJSON();

  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [
      ['WHAT IS THE PRODUCT YOU BOUGHT?', 'Latte'],
      ['WHAT IS THE ISSUE ABOUT IT?', 'Wrong order'],
      ['DID YOU READ THE RULES?', 'Yes'],
    ],
  );
});

test('others ticket embed includes the submitted partnership or concern', () => {
  const embed = ticketEmbed('others', { id: 'user-1' }, undefined, undefined, {
    type: 'PARTNERSHIP',
  }).toJSON();

  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [['PARTNERSHIP / CONCERN', 'PARTNERSHIP']],
  );
});

test('ticket action buttons include claim and close, disabling claim after assignment', () => {
  const buttons = ticketButtons().toJSON().components;
  assert.deepEqual(buttons.map((button) => button.custom_id), ['ticket:claim', 'ticket:close']);
  assert.equal(buttons[0].label, 'Claim Ticket');
  assert.notEqual(buttons[0].disabled, true);

  const claimedButtons = ticketButtons(true).toJSON().components;
  assert.deepEqual(
    claimedButtons.map((button) => button.custom_id),
    ['ticket:claim', 'ticket:unclaim', 'ticket:close'],
  );
  assert.equal(claimedButtons[0].label, 'Claimed');
  assert.equal(claimedButtons[0].disabled, true);
  assert.equal(claimedButtons[1].label, 'Unclaim Ticket');
  assert.notEqual(claimedButtons[1].disabled, true);
  assert.notEqual(claimedButtons[2].disabled, true);
});

test('ticket close confirmation embed asks before closing and offers confirm or cancel', () => {
  const embed = ticketCloseConfirmationEmbed({ toString: () => '<#ticket-1>' }).toJSON();
  assert.equal(embed.title, 'Confirm Ticket Closure');
  assert.equal(embed.description, 'Are you sure you want to close <#ticket-1>?');

  const buttons = ticketCloseConfirmationButtons('confirm-123').toJSON().components;
  assert.deepEqual(buttons.map(({ custom_id, label }) => [custom_id, label]), [
    ['ticket-close:confirm:confirm-123', 'Confirm Close'],
    ['ticket-close:cancel:confirm-123', "No, don't close"],
  ]);
});

test('ticket close reason modal requires a reason before closure', () => {
  const modal = ticketCloseReasonModal('confirm-123').toJSON();
  assert.equal(modal.custom_id, 'ticket-close-reason:confirm-123');
  assert.equal(modal.title, 'Ticket Closure Reason');
  assert.deepEqual(
    modal.components.map((row) => {
      const input = row.components[0];
      return {
        customId: input.custom_id,
        label: input.label,
        style: input.style,
        required: input.required,
        maxLength: input.max_length,
      };
    }),
    [{
      customId: 'ticket-close-reason',
      label: 'Why are you closing this ticket?',
      style: 2,
      required: true,
      maxLength: 1000,
    }],
  );
});

test('ticket access includes configured ticket, admin, and owner roles', () => {
  assert.deepEqual(ticketAccessRoleIds({
    ticketStaffRoleId: 'ticket-staff',
    adminRoleId: 'admin',
    ownerRoleId: 'owner',
  }), ['ticket-staff', 'admin', 'owner']);
  assert.deepEqual(ticketAccessRoleIds({
    ticketStaffRoleId: 'same-role',
    adminRoleId: 'same-role',
    ownerRoleId: 'owner',
  }), ['same-role', 'owner']);
});

test('only configured /setadmin and /setowner roles can claim or close tickets', () => {
  assert.deepEqual(ticketManagerRoleIds({
    ticketStaffRoleId: 'ticket-staff',
    adminRoleId: 'admin',
    ownerRoleId: 'owner',
  }), ['admin', 'owner']);
  assert.deepEqual(ticketManagerRoleIds({ ticketStaffRoleId: 'ticket-staff' }), []);
});

test('new tickets mention only the configured /setadmin and /setowner roles', () => {
  assert.deepEqual(ticketManagerMentionPayload({
    ticketStaffRoleId: 'ticket-staff',
    adminRoleId: 'admin',
    ownerRoleId: 'owner',
  }), {
    content: '<@&admin> <@&owner>',
    allowedMentions: { roles: ['admin', 'owner'] },
  });
  assert.deepEqual(ticketManagerMentionPayload({}), {
    allowedMentions: { roles: [] },
  });
});

test('ticket channel names include type, submitted form answer, and username', () => {
  assert.equal(ticketChannelName('order', 'Alex Smith', 'Latte'), 'order-latte-alex-smith');
  assert.equal(ticketChannelName('report', 'Alex Smith', 'Wrong item!'), 'report-wrong-item-alex-smith');
  assert.equal(
    ticketChannelName('others', 'Alex Smith', 'I want to discuss a partnership'),
    'others-partnership-concern-alex-smith',
  );
  assert.equal(ticketChannelName('others', 'Alex Smith'), 'others-partnership-concern-alex-smith');
  assert.ok(ticketChannelName('order', 'Alex', 'A'.repeat(200)).length <= 100);
});

test('ticket owner lookup only recognizes active ticket topics', () => {
  assert.equal(ticketOwnerId({ topic: 'ticket-owner:123456789012345678;ticket-type:order' }), '123456789012345678');
  assert.equal(ticketOwnerId({ topic: 'ticket-owner:123456789012345678;ticket-type:report;ticket-claimed:234567890123456789' }), '123456789012345678');
  assert.equal(ticketOwnerId({ topic: 'ticket-owner:123456789012345678' }), null);
  assert.equal(ticketOwnerId({ topic: 'ticket-owner:123456789012345678;ticket-type:unknown' }), null);
  assert.equal(ticketOwnerId(null), null);
});

test('ticket terms state is recorded in the order ticket topic', () => {
  const required = { topic: 'ticket-owner:123;ticket-type:order;ticket-terms-required' };
  const accepted = { topic: `${required.topic};ticket-terms-accepted` };

  assert.equal(ticketTermsRequired(required), true);
  assert.equal(ticketTermsAccepted(required), false);
  assert.equal(ticketTermsRequired(accepted), true);
  assert.equal(ticketTermsAccepted(accepted), true);
  assert.equal(ticketTermsRequired({ topic: 'ticket-owner:123;ticket-type:report' }), false);
});

test('orders in tickets use the ticket owner as the customer', () => {
  const channel = { topic: 'ticket-owner:123456789012345678;ticket-type:order' };
  assert.equal(ticketCustomerId(channel, '987654321098765432'), '123456789012345678');
  assert.equal(ticketCustomerId({ topic: null }, '987654321098765432'), '987654321098765432');
});

test('order ticket product comes from the topic or the original ticket embed', async () => {
  assert.equal(await ticketProduct({
    topic: 'ticket-owner:123;ticket-type:order;ticket-product:GAMECREDITS',
  }), 'GAMECREDITS');

  const messages = new Map([['message-1', {
    embeds: [{
      title: 'ORDER TICKET',
      fields: [{ name: 'PRODUCT', value: 'ROBUX' }],
    }],
  }]]);
  assert.equal(await ticketProduct({
    topic: 'ticket-owner:123;ticket-type:order',
    messages: { fetch: async () => messages },
  }), 'ROBUX');

  assert.equal(await ticketProduct({ topic: 'ticket-owner:123;ticket-type:report' }), null);
});

test('ticket creation finds existing tickets and serializes simultaneous submissions', async () => {
  const existingTicket = { id: 'ticket-1', topic: 'ticket-owner:123;ticket-type:report' };
  assert.equal(findActiveTicket(new Map([[existingTicket.id, existingTicket]]), '123'), existingTicket);
  assert.equal(findActiveTicket(new Map([[existingTicket.id, existingTicket]]), '456'), null);

  const channels = new Map();
  const attempts = await Promise.all([1, 2].map((attempt) => withTicketCreationLock('guild:user', async () => {
    if (findActiveTicket(channels, '123')) return false;
    await Promise.resolve();
    const ticket = { id: `ticket-${attempt}`, topic: 'ticket-owner:123;ticket-type:order' };
    channels.set(ticket.id, ticket);
    return true;
  })));

  assert.equal(attempts.filter(Boolean).length, 1);
  assert.equal(channels.size, 1);
});

test('duplicate ticket command and per-ticket category commands are not registered', () => {
  assert.equal(commands.find((command) => command.name === 'ticket'), undefined);
  for (const name of ['ordercategory', 'reportcategory', 'othercategory']) {
    assert.equal(commands.find((command) => command.name === name), undefined);
  }
});

test('/vouch accepts one required proof and an optional second proof', () => {
  const command = commands.find((entry) => entry.name === 'vouch');
  const proofs = command.options.filter((option) => option.type === 11);

  assert.deepEqual(
    proofs.map(({ name, required }) => ({ name, required })),
    [
      { name: 'proof', required: true },
      { name: 'proof2', required: false },
    ],
  );
});

test('vouch preview offers confirm and change actions', () => {
  const buttons = vouchPreviewButtons('preview-123').toJSON().components;
  assert.deepEqual(buttons.map(({ custom_id, label }) => [custom_id, label]), [
    ['vouch-preview:confirm:preview-123', 'Confirm vouch'],
    ['vouch-preview:change:preview-123', "No, I'll change it"],
  ]);
});

test('/solving is registered with two required numeric amounts', () => {
  const command = commands.find((entry) => entry.name === 'solving');
  assert.ok(command);
  assert.deepEqual(
    command.options.map(({ name, type, required }) => ({ name, type, required })),
    [
      { name: 'amount_one', type: 10, required: true },
      { name: 'amount_two', type: 10, required: true },
    ],
  );
});

test('calc shortcut parses a single multiplication expression', () => {
  assert.deepEqual(parseTicketMessageCommand(',calc 5*5'), {
    name: 'calc',
    args: ['5*5'],
  });
  assert.deepEqual(parseTicketMessageCommand(',calc'), {
    name: 'calc',
    args: [],
  });
  assert.equal(parseTicketMessageCommand(',payment'), null);
  assert.equal(parseTicketMessageCommand(',PAYMENT'), null);
  assert.equal(parseTicketMessageCommand(',solving 5*5'), null);
});

test('multiplication handles finite numbers and rejects invalid values or overflow', () => {
  assert.deepEqual(multiplyAmounts('2.5', '-4'), {
    amountOne: 2.5,
    amountTwo: -4,
    product: -10,
  });
  assert.deepEqual(multiplyAmounts(0, 3), {
    amountOne: 0,
    amountTwo: 3,
    product: 0,
  });
  assert.equal(multiplyAmounts('not-a-number', '3'), null);
  assert.equal(multiplyAmounts('1e309', '2'), null);
  assert.equal(multiplyAmounts(Number.MAX_VALUE, 2), null);
  assert.deepEqual(multiplyExpression('5*5'), {
    amountOne: 5,
    amountTwo: 5,
    product: 25,
  });
  assert.deepEqual(multiplyExpression('-2.5 * 4'), {
    amountOne: -2.5,
    amountTwo: 4,
    product: -10,
  });
  assert.equal(multiplyExpression('5**5'), null);
  assert.equal(multiplyExpression('5*x'), null);
});

test('multiplication result is formatted as an embed for slash commands', () => {
  const embed = multiplicationEmbed(multiplyExpression('5*5')).toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(embed.description, '**5 x 5 = 25**');
});

test('multiplication result is formatted as a V2 container for ,calc', () => {
  const container = multiplicationContainer(multiplyExpression('5*5')).toJSON();
  assert.equal(container.type, 17);
  assert.equal(container.components[0].content, '**5 x 5 = 25**');
});

test('payment reminder embed has the requested description, no title, and server icon thumbnail', () => {
  const embed = paymentReminderEmbed('https://cdn.example/server.png').toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(
    embed.description,
    '゛ **Dolce Vita payment reminders:**  ⸝⸝   .ᐟ 𑣲\n» send the payment details via screenshot.\n» pls complete your payment within 12hrs.\n» once payment is verified, the order will be processed.\n» no rush of orders!\n» pls click `pay` to proceed, `no` to cancel.',
  );
  assert.deepEqual(embed.thumbnail, { url: 'https://cdn.example/server.png' });
});

test('payment reminder embed supports servers without a custom icon', () => {
  const embed = paymentReminderEmbed(null).toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(embed.thumbnail, undefined);
});

test('vouch embed matches the order-details layout and Philippine time zone', () => {
  const vouchedAt = new Date('2026-10-04T22:53:00Z');
  const embed = vouchEmbed({
    id: 'user-123',
    displayName: 'Alex',
    displayAvatarURL: () => 'https://example.test/avatar.png',
  }, '1 Deco', 'Great service!', vouchedAt).toJSON();

  assert.equal(embed.title, undefined);
  assert.equal(embed.description, undefined);
  assert.deepEqual(embed.fields.map(({ name, value }) => [name, value]), [
    ['✨ • order details', '**buyer:** <@user-123>'],
    ['🔹 item', '1 Deco'],
    ['🔹 date vouched', 'October 05, 2026 at 6:53 AM PHT (UTC+8)'],
    ['🔹 feedback', 'Great service!'],
    ['🔹 proof', 'See the attached proof image below.'],
  ]);
});

test('completed order reminder is a V2 container with a Vouch button and warranty policy', () => {
  const container = orderCompletionReminderContainer('ORDER-1').toJSON();

  assert.equal(container.type, 17);
  assert.equal(container.components[0].content, [
    '**REMINDERS : WARRANTY POLICY!!**',
    '› All completed orders come with a 12-hours warranty.',
    '› Replacements will only be provided for verified issues covered by warranty.',
    '› Once the warranty expires, the shop is no longer responsible for issues covered by the expired warranty.',
    '› vouch within 12 hrs αfter clαiming order.',
    '› NO VOUCH = no refund, no replacement & no warranty.',
  ].join('\n'));
  assert.equal(container.components[1].type, 1);
  assert.deepEqual(container.components[1].components.map(({ custom_id, label }) => [custom_id, label]), [
    ['order:vouch:ORDER-1', 'Vouch'],
  ]);
  assert.equal(orderVouchButton('ORDER-1').toJSON().components[0].label, 'Vouch');
});

test('completed order Vouch modal requests validated product, quantity, feedback, and one or two proofs', () => {
  const modal = orderVouchModal('ORDER-1').toJSON();

  assert.equal(modal.custom_id, 'order-vouch-form:ORDER-1');
  assert.equal(modal.title, 'VOUCH FORM');
  assert.deepEqual(modal.components.map(({ label }) => label), [
    'Product',
    'Quantity',
    'Feedback',
    'Proof',
  ]);
  const product = modal.components[0].component;
  assert.equal(product.placeholder, 'DEKOR / GAMECREDITS / ROBUX');
  assert.equal(modal.components[0].description, 'DEKOR / GAMECREDITS / ROBUX');
  assert.equal(modal.components[1].component.placeholder, '1-1000');
  assert.equal(modal.components[2].component.style, 2);
  assert.deepEqual(
    {
      minValues: modal.components[3].component.min_values,
      maxValues: modal.components[3].component.max_values,
      required: modal.components[3].component.required,
    },
    { minValues: 1, maxValues: 2, required: true },
  );
});

test('payment details embed includes GCash instructions and the attached payment image', () => {
  const embed = paymentDetailsEmbed().toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(
    embed.description,
    '**🧁 payment method: gcash**\ngcash initials: H. C. S.\ngcash number: `09639298459`\npls send screenshot of the receipt, ty!',
  );
  assert.deepEqual(embed.image, { url: 'attachment://gcash-payment.png' });
});

test('payment reminder has pay and no buttons in the requested order', () => {
  const buttons = paymentReminderButtons().toJSON().components;
  assert.deepEqual(buttons.map(({ custom_id, label }) => [label, custom_id]), [
    ['pay', 'payment:yes'],
    ['no', 'payment:no'],
  ]);
});

test('calc shortcut replies with the result before deleting the command message', async () => {
  const calls = [];
  const message = {
    reply: async (payload) => calls.push(['reply', payload]),
    delete: async () => calls.push(['delete']),
  };
  const reply = {
    components: [multiplicationContainer(multiplyAmounts('2', '3'))],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
  const deleteError = await replyThenDeleteCommand(message, reply);
  assert.equal(deleteError, null);
  assert.deepEqual(calls, [
    ['reply', reply],
    ['delete'],
  ]);
});

test('calc shortcut reports command deletion errors to its caller', async () => {
  const deleteError = new Error('Missing Manage Messages permission');
  const message = {
    reply: async () => {},
    delete: async () => { throw deleteError; },
  };
  assert.equal(await replyThenDeleteCommand(message, 'result'), deleteError);
});

test('/ticketsetup is registered as an administrator command', () => {
  const command = commands.find((entry) => entry.name === 'ticketsetup');
  assert.ok(command);
  assert.equal(command.default_member_permissions, '8');
  assert.deepEqual(command.options.map(({ name, required }) => ({ name, required })), [
    { name: 'staff_role', required: false },
  ]);
});

test('/payment is registered as a slash command', () => {
  const command = commands.find((entry) => entry.name === 'payment');
  assert.ok(command);
  assert.equal(command.description, 'Send the payment reminder in this ticket.');
  assert.deepEqual(command.options, []);
});

test('calc is the only supported comma message command', () => {
  for (const command of [
    ',help',
    ',ticketsetup',
    ',payment',
    ',setorder 123456789012345678',
    ',setvoided 1234567890',
    ',setvoidedrole 9876543210',
    ',setrolevoided 9876543210',
    ',setupticketcategory 123456789012345678',
    ',set ticket_transcript 123456789012345678',
  ]) {
    assert.equal(parseTicketMessageCommand(command), null, `${command} should not be recognized`);
  }
});

test('help command lists slash commands and the remaining message command', () => {
  const embed = helpEmbed(commands).toJSON();
  assert.equal(commands.find((command) => command.name === 'help')?.description, 'List all bot commands.');
  for (const commandText of [
    '/help',
    '/setup',
    '/solving',
    ',calc <number>*<number>',
    '/set vouch',
    '/set ticket_transcript',
    '/set voided_role',
    '/voidedchannel',
    '/ticketsetup',
    '/stickymessage set',
    '/stickymessage remove',
    '/setupticketcategory',
  ]) {
    assert.ok(embed.description.includes(commandText), `Expected help embed to include ${commandText}`);
  }
  assert.doesNotMatch(embed.description, /Ticket notes|unclaimed only by the current claimant|automatically delete the ticket channel/);
  assert.ok(embed.description.indexOf('## Slash commands') < embed.description.indexOf('## Message commands'));
  assert.equal(
    embed.description.split('## Message commands\n')[1],
    '**,calc <number>*<number>** — Multiply two numbers, then automatically delete the command message.',
  );
  assert.ok(embed.description.length <= 4096);
});

test('ticket transcript channel setup is registered under /set for administrators', () => {
  const setCommand = commands.find((command) => command.name === 'set');
  const transcriptSubcommand = setCommand.options.find((option) => option.name === 'ticket_transcript');
  assert.ok(transcriptSubcommand);
  assert.equal(transcriptSubcommand.options[0].name, 'channel');
  assert.equal(setCommand.default_member_permissions, '8');
  assert.equal(setCommand.options.some((option) => option.name === 'voided'), false);
});

test('/set voided_role configures the completed-order role', () => {
  const setCommand = commands.find((command) => command.name === 'set');
  const voidedRole = setCommand.options.find((option) => option.name === 'voided_role');

  assert.ok(voidedRole);
  assert.equal(voidedRole.options[0].name, 'role');
  assert.equal(voidedRole.options[0].required, true);
  assert.match(voidedRole.description, /assigned when an order is completed/);
});

test('/voidedchannel is an administrator command with a text channel option', () => {
  const voidedChannelCommands = commands.filter((entry) => entry.name === 'voidedchannel');
  assert.equal(voidedChannelCommands.length, 1);
  const [command] = voidedChannelCommands;
  assert.ok(command);
  assert.equal(command.default_member_permissions, '8');
  assert.deepEqual(
    command.options.map(({ name, required }) => ({ name, required })),
    [{ name: 'channel', required: true }],
  );
});

test('warranty-void notice is a V2 container with the required owner, item, and reason', () => {
  const container = warrantyVoidedContainer({
    customerId: '123456789012345678',
    ticketProduct: 'GAMECREDITS',
    items: 'Different order description',
  }).toJSON();

  assert.equal(container.type, 17);
  assert.equal(container.accent_color, 0xc94c4c);
  assert.equal(container.components[0].content, [
    '_ _',
    '_ _      ᨳଓ warranty voided',
    '_ _       <@123456789012345678> has been revoked the **warranty**',
    '_ _',
    '_ _       **user**',
    '_ _        ⧽ <@123456789012345678> | 123456789012345678',
    '_ _',
    '_ _       **item**',
    '_ _        ⧽ GAMECREDITS',
    '_ _',
    '_ _       **reason**',
    '_ _        ⧽ No Vouch = Warranty Voided',
    '_ _',
  ].join('\n'));
});

test('ticket transcript embed shows the closure details in the requested layout', () => {
  const embed = ticketTranscriptEmbed({
    channelId: '282',
    createdAt: new Date('2026-10-04T08:47:00Z'),
    ownerId: 'ticket-owner',
    closedById: 'staff-1',
    claimedById: 'staff-1',
    reason: 'Customer request',
  }).toJSON();

  assert.equal(embed.title, 'Ticket Closed');
  assert.equal(embed.description, undefined);
  assert.deepEqual(
    embed.fields.map(({ name, value, inline }) => [name, value, inline]),
    [
      ['🔢 Ticket ID', '282', true],
      ['✅ Opened By', '<@ticket-owner>', true],
      ['🔒 Closed By', '<@staff-1>', true],
      ['🕒 Open Time', '<t:1791103620:f>', true],
      ['🟣 Claimed By', '<@staff-1>', true],
      ['❔ Reason', 'Customer request', true],
    ],
  );
});

test('ticket transcript shows unclaimed tickets in the closure summary', () => {
  const embed = ticketTranscriptEmbed({
    channelId: '282',
    createdAt: new Date('2026-10-04T08:47:00Z'),
    ownerId: 'ticket-owner',
    closedById: 'staff-1',
  }).toJSON();

  assert.equal(embed.fields.find(({ name }) => name === '🟣 Claimed By').value, 'Unclaimed');
});

test('ticket transcript text preserves message order, content, and attachment links', () => {
  const messages = [
    {
      createdTimestamp: Date.parse('2026-01-02T00:00:00.000Z'),
      author: { tag: 'Alex#0001' },
      content: 'Hello staff',
      attachments: new Map([['attachment-1', { name: 'proof.png', url: 'https://example.test/proof.png' }]]),
    },
    {
      createdTimestamp: Date.parse('2026-01-02T00:01:00.000Z'),
      author: { tag: 'Staff#0001' },
      content: 'How can I help?',
      attachments: new Map(),
    },
  ];

  const transcript = ticketTranscriptText(messages);
  assert.ok(transcript.indexOf('Alex#0001:') < transcript.indexOf('Staff#0001:'));
  assert.match(transcript, /Hello staff/);
  assert.match(transcript, /proof\.png \(https:\/\/example\.test\/proof\.png\)/);
});
