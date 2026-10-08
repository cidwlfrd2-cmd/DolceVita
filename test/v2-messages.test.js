const assert = require('node:assert/strict');
const test = require('node:test');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const {
  closeShopContainer,
  openShopContainer,
  robuxFormContainer,
} = require('../src/embeds');
const {
  v2Payload,
  wrapInteractionResponses,
  wrapMessageResponses,
} = require('../src/v2-messages');

test('plain text and embeds are converted into colorless V2 containers', () => {
  const payload = v2Payload({
    content: 'A plain response',
    embeds: [new EmbedBuilder()
      .setTitle('Order update')
      .setDescription('The order is complete.')
      .addFields({ name: 'Item', value: 'Coffee' })],
    allowedMentions: { parse: [] },
  });

  assert.equal(payload.content, undefined);
  assert.equal(payload.embeds, undefined);
  assert.equal(payload.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  const components = payload.components.map((component) => component.toJSON());
  assert.equal(components.length, 2);
  assert.ok(components.every((component) => component.type === 17));
  assert.ok(components.every((component) => component.accent_color === undefined));
  assert.match(components[0].components[0].content, /A plain response/);
  assert.match(components[1].components[0].content, /Order update/);
  assert.match(components[1].components[0].content, /Coffee/);
});

test('private text replies retain ephemeral behavior when converted', () => {
  const payload = v2Payload({ content: 'Only you can see this.', ephemeral: true });
  assert.equal(payload.flags & MessageFlags.Ephemeral, MessageFlags.Ephemeral);
  assert.equal(payload.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
  assert.equal(payload.ephemeral, undefined);
  assert.equal(payload.content, undefined);
});

test('interaction replies and message replies are wrapped as V2 payloads', async () => {
  const interaction = {
    message: { edit: async (payload) => payload },
    reply: async (payload) => payload,
    update: async (payload) => payload,
    editReply: async (payload) => payload,
    followUp: async (payload) => payload,
  };
  wrapInteractionResponses(interaction);
  const reply = await interaction.reply({ content: 'Interaction response', ephemeral: true });
  assert.equal(reply.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
  assert.equal(reply.flags & MessageFlags.Ephemeral, MessageFlags.Ephemeral);
  assert.equal(reply.components[0].toJSON().type, 17);
  assert.equal((await interaction.message.edit('Edited response')).components[0].toJSON().type, 17);

  const message = { reply: async (payload) => payload };
  wrapMessageResponses(message);
  const messageReply = await message.reply('Message response');
  assert.equal(messageReply.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
});

test('Robux and shop announcement builders return colorless V2 containers', () => {
  const cases = [
    [robuxFormContainer(), /RBX FILL UP FORM/],
    [openShopContainer(), /Dolce Vita is now __open__/],
    [closeShopContainer(), /Dolce Vita is now __closed__/],
  ];

  for (const [builder, expectedText] of cases) {
    const container = builder.toJSON();
    assert.equal(container.type, 17);
    assert.equal(container.accent_color, undefined);
    assert.match(container.components[0].content, expectedText);
  }
});
