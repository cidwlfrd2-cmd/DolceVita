const assert = require('node:assert/strict');
const test = require('node:test');
const {
  orderTicketModal,
  ticketPanelButtons,
  ticketPanelEmbed,
  ticketEmbed,
  ticketButtons,
  reportTicketModal,
  othersTicketModal,
  ticketTranscriptEmbed,
  helpEmbed,
} = require('../src/embeds');
const commands = require('../src/commands');
const { ticketChannelName } = require('../src/ticket-names');
const { ticketTranscriptText } = require('../src/ticket-transcript');

test('ticket panel contains the three requested buttons and an embed', () => {
  assert.equal(ticketPanelEmbed().toJSON().title, 'Open a Ticket');
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
  assert.equal(claimedButtons[0].label, 'Claimed');
  assert.equal(claimedButtons[0].disabled, true);
  assert.notEqual(claimedButtons[1].disabled, true);
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

test('ticket setup is registered as an administrator subcommand', () => {
  const ticketCommand = commands.find((command) => command.name === 'ticket');
  assert.ok(ticketCommand);
  assert.equal(ticketCommand.options[0].name, 'setup');
  assert.equal(ticketCommand.default_member_permissions, '8');
});

test('ticketsetup shortcut is registered as an administrator command', () => {
  const shortcut = commands.find((command) => command.name === 'ticketsetup');
  assert.ok(shortcut);
  assert.equal(shortcut.default_member_permissions, '8');
});

test('help command lists registered commands, subcommands, and message shortcuts', () => {
  const embed = helpEmbed(commands).toJSON();
  assert.equal(commands.find((command) => command.name === 'help')?.description, 'List all bot commands.');
  for (const commandText of [
    '/help',
    '/setup',
    '/set vouch',
    '/set ticket_transcript',
    '/ticket setup',
    '/ticketsetup',
    '/stickymessage set',
    '/stickymessage remove',
    ',ticketsetup',
    ',help',
  ]) {
    assert.ok(embed.description.includes(commandText), `Expected help embed to include ${commandText}`);
  }
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
