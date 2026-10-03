const assert = require('node:assert/strict');
const test = require('node:test');
const {
  orderTicketModal,
  ticketPanelButtons,
  ticketEmbed,
  ticketButtons,
  reportTicketModal,
  othersTicketModal,
  ticketTranscriptEmbed,
  helpEmbed,
  multiplicationEmbed,
  paymentReminderEmbed,
  paymentDetailsEmbed,
  paymentReminderButtons,
} = require('../src/embeds');
const commands = require('../src/commands');
const { ticketChannelName } = require('../src/ticket-names');
const { ticketOwnerId } = require('../src/ticket-context');
const { ticketTranscriptText } = require('../src/ticket-transcript');
const { parseTicketMessageCommand } = require('../src/ticket-message-commands');
const { ticketAccessRoleIds, ticketManagerRoleIds } = require('../src/ticket-permissions');
const { multiplyAmounts } = require('../src/multiplication');
const { replyThenDeleteCommand } = require('../src/message-command-actions');

test('ticket panel contains only the three requested buttons', () => {
  assert.deepEqual(
    ticketPanelButtons().toJSON().components.map((button) => button.label),
    ['order', 'report', 'others'],
  );
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
  assert.equal(modal.components[0].components[0].required, true);
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
    message: 'I would like to discuss a partnership.',
  }).toJSON();

  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [['PARTNERSHIP / CONCERN', 'I would like to discuss a partnership.']],
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

test('ticket setup is registered as an administrator subcommand', () => {
  const ticketCommand = commands.find((command) => command.name === 'ticket');
  assert.ok(ticketCommand);
  assert.equal(ticketCommand.options[0].name, 'setup');
  assert.equal(ticketCommand.default_member_permissions, '8');
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

test('message solving shortcut parses the supplied values for usage validation', () => {
  assert.deepEqual(parseTicketMessageCommand(',solving 2.5 -4'), {
    name: 'solving',
    args: ['2.5', '-4'],
  });
  assert.deepEqual(parseTicketMessageCommand(',solving'), {
    name: 'solving',
    args: [],
  });
  assert.deepEqual(parseTicketMessageCommand(',solving 1 2 3'), {
    name: 'solving',
    args: ['1', '2', '3'],
  });
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
});

test('multiplication result is formatted as an embed', () => {
  const embed = multiplicationEmbed(multiplyAmounts('2.5', '-4')).toJSON();
  assert.equal(embed.title, 'Multiplication Result');
  assert.equal(embed.description, '**2.5 × -4 = -10**');
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

test('payment details embed includes GCash instructions and the attached payment image', () => {
  const embed = paymentDetailsEmbed().toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(
    embed.description,
    '**🧁 payment method: gcash**\ngcash initials: H. C. S.\ngcash number: `09639298459`\npls send screenshot of the receipt, ty!',
  );
  assert.deepEqual(embed.image, { url: 'attachment://gcash-payment.png' });
});

test('payment reminder has yes and no buttons in the requested order', () => {
  const buttons = paymentReminderButtons().toJSON().components;
  assert.deepEqual(buttons.map(({ custom_id, label }) => [label, custom_id]), [
    ['yes', 'payment:yes'],
    ['no', 'payment:no'],
  ]);
});

test('solving shortcut replies with the result before deleting the command message', async () => {
  const calls = [];
  const message = {
    reply: async (payload) => calls.push(['reply', payload]),
    delete: async () => calls.push(['delete']),
  };
  const resultEmbed = multiplicationEmbed(multiplyAmounts('2', '3'));
  const reply = { embeds: [resultEmbed], allowedMentions: { parse: [] } };
  const deleteError = await replyThenDeleteCommand(message, reply);
  assert.equal(deleteError, null);
  assert.deepEqual(calls, [
    ['reply', reply],
    ['delete'],
  ]);
});

test('solving shortcut reports command deletion errors to its caller', async () => {
  const deleteError = new Error('Missing Manage Messages permission');
  const message = {
    reply: async () => {},
    delete: async () => { throw deleteError; },
  };
  assert.equal(await replyThenDeleteCommand(message, 'result'), deleteError);
});

test('ticketsetup shortcut is registered as an administrator command', () => {
  const shortcut = commands.find((command) => command.name === 'ticketsetup');
  assert.ok(shortcut);
  assert.equal(shortcut.default_member_permissions, '8');
});

test('ticket category setup slash command takes a category ID and requires administrator permission', () => {
  const command = commands.find((entry) => entry.name === 'setupticketcategory');
  assert.ok(command);
  assert.equal(command.options[0].name, 'category_id');
  assert.equal(command.options[0].required, true);
  assert.equal(command.default_member_permissions, '8');
});

test('ticket message command parser recognizes category and transcript setup aliases', () => {
  assert.deepEqual(parseTicketMessageCommand(',setupticketcategory 123456789012345678'), {
    name: 'setupticketcategory',
    args: ['123456789012345678'],
  });
  assert.deepEqual(parseTicketMessageCommand(',set ticket_transcript 123456789012345678'), {
    name: 'set_ticket_transcript',
    args: ['123456789012345678'],
  });
  assert.equal(parseTicketMessageCommand(',set something-else 123'), null);
});

test('ticket message command parser recognizes payment reminder shortcut without arguments', () => {
  assert.deepEqual(parseTicketMessageCommand(',payment'), {
    name: 'payment',
    args: [],
  });
  assert.equal(parseTicketMessageCommand(',payment extra'), null);
});

test('bot pronouns shortcut is not registered', () => {
  assert.equal(parseTicketMessageCommand(',botpronouns'), null);
  assert.equal(parseTicketMessageCommand(',pronouns'), null);
});

test('removed ticket role setup message commands are not recognized', () => {
  assert.equal(parseTicketMessageCommand(',ticket setup staff_role 123456789012345678'), null);
  assert.equal(parseTicketMessageCommand(',ticket setup ownersv_role 123456789012345678'), null);
});

test('help command lists registered commands, subcommands, and message shortcuts', () => {
  const embed = helpEmbed(commands).toJSON();
  assert.equal(commands.find((command) => command.name === 'help')?.description, 'List all bot commands.');
  for (const commandText of [
    '/help',
    '/setup',
    '/solving',
    ',solving <number> <number>',
    '/set vouch',
    '/set ticket_transcript',
    '/ticket setup',
    '/ticketsetup',
    '/stickymessage set',
    '/stickymessage remove',
    ',ticketsetup',
    ',help',
    '/setupticketcategory',
    ',setupticketcategory',
    ',set ticket_transcript',
  ]) {
    assert.ok(embed.description.includes(commandText), `Expected help embed to include ${commandText}`);
  }
  assert.match(embed.description, /unclaimed only by the current claimant/);
  assert.match(embed.description, /automatically delete the ticket channel/);
  assert.ok(embed.description.length <= 4096);
});

test('ticket transcript channel setup is registered under /set for administrators', () => {
  const setCommand = commands.find((command) => command.name === 'set');
  const transcriptSubcommand = setCommand.options.find((option) => option.name === 'ticket_transcript');
  assert.ok(transcriptSubcommand);
  assert.equal(transcriptSubcommand.options[0].name, 'channel');
  assert.equal(setCommand.default_member_permissions, '8');
});

test('ticket transcript embed includes ticket, participants, and message count', () => {
  const embed = ticketTranscriptEmbed({
    channelId: 'ticket-channel',
    channelName: 'order-latte-alex',
    ownerId: 'ticket-owner',
    closedById: 'staff-1',
    claimedById: 'staff-1',
    messageCount: 3,
    transcriptPreview: 'Alex: I need help.\nStaff: How can we help?',
  }).toJSON();

  assert.equal(embed.title, 'Ticket Transcript');
  assert.match(embed.description, /order-latte-alex/);
  assert.match(embed.description, /Alex: I need help\./);
  assert.deepEqual(
    embed.fields.map((field) => field.name),
    ['Ticket', 'Opened by', 'Closed by', 'Messages', 'Claimed by'],
  );
  assert.equal(embed.fields.find((field) => field.name === 'Messages').value, '3');
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
