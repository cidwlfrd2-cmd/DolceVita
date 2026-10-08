const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');

function splitText(text, maxLength = 4000) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < 1) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function embedText(embed) {
  return [
    embed.author?.name ? `**${embed.author.name}**` : '',
    embed.title ? `## ${embed.title}` : '',
    embed.description ?? '',
    ...(embed.fields ?? []).map(({ name, value, inline }) => (
      `**${name}**${inline ? '  ' : '\n'}${value}`
    )),
    embed.footer?.text ? `-# ${embed.footer.text}` : '',
    embed.timestamp ? `-# ${new Date(embed.timestamp).toISOString()}` : '',
  ].filter(Boolean).join('\n\n');
}

function embedContainer(embed) {
  const container = new ContainerBuilder();
  const text = embedText(embed);
  for (const chunk of splitText(text || '\u200b')) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
  }

  const imageUrls = [embed.image?.url, embed.thumbnail?.url].filter(Boolean);
  if (imageUrls.length) {
    const gallery = new MediaGalleryBuilder().addItems(
      ...imageUrls.map((url) => new MediaGalleryItemBuilder().setURL(url)),
    );
    container.addMediaGalleryComponents(gallery);
  }
  return container;
}

function v2Payload(payload) {
  const normalized = typeof payload === 'string' ? { content: payload } : { ...payload };
  const components = [];
  if (normalized.content) {
    for (const chunk of splitText(normalized.content)) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
      components.push(container);
    }
  }
  for (const embed of normalized.embeds ?? []) {
    const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    components.push(embedContainer(data));
  }
  components.push(...(normalized.components ?? []));
  if (!components.length) {
    components.push(new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('\u200b')));
  }

  const flags = Number(normalized.flags ?? 0) | MessageFlags.IsComponentsV2;
  if (normalized.ephemeral) normalized.flags = flags | MessageFlags.Ephemeral;
  else normalized.flags = flags;
  delete normalized.content;
  delete normalized.embeds;
  delete normalized.ephemeral;
  normalized.components = components;
  return normalized;
}

function wrapPayloadMethod(target, method) {
  if (!target || typeof target[method] !== 'function') return;
  const original = target[method].bind(target);
  target[method] = (payload, ...args) => original(v2Payload(payload), ...args);
}

function wrapInteractionResponses(interaction) {
  for (const method of ['reply', 'update', 'editReply', 'followUp']) {
    wrapPayloadMethod(interaction, method);
  }
  wrapPayloadMethod(interaction.message, 'edit');
}

function wrapMessageResponses(message) {
  wrapPayloadMethod(message, 'reply');
}

async function sendV2(target, payload) {
  return target.send(v2Payload(payload));
}

module.exports = {
  sendV2,
  v2Payload,
  wrapInteractionResponses,
  wrapMessageResponses,
};
