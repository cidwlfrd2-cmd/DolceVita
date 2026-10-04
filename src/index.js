require('dotenv').config();

const {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { OrderStore } = require('./store');
const {
  orderButtons,
  orderContainer,
  orderStatusEmbed,
  orderCompletionReminderContainer,
  orderVouchModal,
  multiplicationEmbed,
  vouchEmbed,
  vouchPreviewButtons,
  voidedOrderEmbed,
  paymentDetailsEmbed,
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
} = require('./embeds');
const { createProofCollage } = require('./vouch-proofs');
const { ticketTranscriptText } = require('./ticket-transcript');
const { ticketChannelName } = require('./ticket-names');
const {
  ticketOwnerId,
  ticketTermsRequired,
  ticketTermsAccepted,
  ticketCustomerId,
  ticketProduct,
} = require('./ticket-context');
const { orderReference } = require('./order-reference');
const { findActiveTicket, withTicketCreationLock } = require('./ticket-creation');
const {
  ticketAccessRoleIds,
  ticketManagerRoleIds,
  hasTicketManagerRole,
  ticketManagerMentionPayload,
  ticketOwnerPermissionOverwrite,
  ticketAccessRolePermissionOverwrite,
} = require('./ticket-permissions');
const { parseTicketMessageCommand } = require('./ticket-message-commands');
const { parseOrderTicketForm } = require('./order-ticket-form');
const { parseOrderVouchForm } = require('./order-vouch-form');
const { parseOthersTicketForm } = require('./others-ticket-form');
const { multiplyAmounts, multiplyExpression } = require('./multiplication');
const { replyThenDeleteCommand } = require('./message-command-actions');
const commands = require('./commands');

const store = new OrderStore();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const stickyRefreshes = new Map();
const ticketClaimLocks = new Map();
const scheduledVoidChecks = new Map();
const pendingTicketClosures = new Map();
const TICKET_CLOSE_CONFIRMATION_DURATION_MS = 5 * 60 * 1000;
const pendingVouchPreviews = new Map();
const VOUCH_PREVIEW_DURATION_MS = 15 * 60 * 1000;

function discardVouchPreview(previewId) {
  const preview = pendingVouchPreviews.get(previewId);
  if (!preview) return;
  clearTimeout(preview.timeoutId);
  pendingVouchPreviews.delete(previewId);
}

async function presentVouchPreview(interaction, {
  guildId,
  items,
  feedback,
  proofs,
  directMessage = false,
  ticketOwnerDmId = null,
}) {
  const settings = store.getSettings(guildId);
  if (!settings?.vouchChannelId) {
    return interaction.editReply('The vouch channel has not been set. Ask an administrator to run `/set vouch channel:#channel`.');
  }
  const channel = await client.channels.fetch(settings.vouchChannelId);
  if (!channel
    || channel.guildId !== guildId
    || !channel.isTextBased()
    || typeof channel.send !== 'function') {
    throw new Error(`Vouch channel ${settings.vouchChannelId} is unavailable or not a sendable server text channel.`);
  }
  let proofCollage;
  try {
    const imageBuffers = [];
    for (const proof of proofs) {
      const response = await fetch(proof.url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Proof download returned HTTP ${response.status}.`);
      imageBuffers.push(Buffer.from(await response.arrayBuffer()));
    }
    proofCollage = await createProofCollage(imageBuffers);
  } catch (error) {
    console.error('Could not create vouch proof collage:', error);
    return interaction.editReply('Could not process the proof images. Please try valid, smaller image files.');
  }
  const vouchedAt = new Date();
  const embed = vouchEmbed(interaction.user, items, feedback, vouchedAt);
  embed.setImage('attachment://vouch-proofs.png');
  const previewId = randomUUID();
  const timeoutId = setTimeout(() => discardVouchPreview(previewId), VOUCH_PREVIEW_DURATION_MS);
  timeoutId.unref();
  pendingVouchPreviews.set(previewId, {
    guildId,
    userId: interaction.user.id,
    channelId: channel.id,
    items,
    vouchedAt,
    ticketOwnerDmId,
    directMessage,
    embed,
    proofCollage,
    timeoutId,
  });
  return interaction.editReply({
    content: 'Preview your vouch below. Confirm to post it, or choose “No, I’ll change it” and submit the form again.',
    embeds: [embed],
    components: [vouchPreviewButtons(previewId)],
    files: [{ attachment: proofCollage, name: 'vouch-proofs.png' }],
    allowedMentions: { parse: [] },
  });
}

async function handleOrderVouchButton(interaction) {
  if (interaction.inGuild()) {
    return interaction.reply({ content: 'Use this Vouch button from the warranty reminder in your DMs.', ephemeral: true });
  }
  const orderId = interaction.customId.slice('order:vouch:'.length);
  const order = store.getOrder(orderId);
  if (!order || order.status !== 'completed' || order.customerId !== interaction.user.id) {
    return interaction.reply({ content: 'This completed-order vouch form is no longer available.', ephemeral: true });
  }
  return interaction.showModal(orderVouchModal(order.id));
}

async function handleOrderVouchModal(interaction) {
  if (interaction.inGuild()) {
    return interaction.reply({ content: 'Submit this vouch form from the warranty reminder in your DMs.', ephemeral: true });
  }
  const orderId = interaction.customId.slice('order-vouch-form:'.length);
  const order = store.getOrder(orderId);
  if (!order || order.status !== 'completed' || order.customerId !== interaction.user.id) {
    return interaction.reply({ content: 'This completed-order vouch form is no longer available.', ephemeral: true });
  }
  const form = parseOrderVouchForm({
    product: interaction.fields.getTextInputValue('order-vouch-product'),
    quantity: interaction.fields.getTextInputValue('order-vouch-quantity'),
    feedback: interaction.fields.getTextInputValue('order-vouch-feedback'),
  });
  if (form.error) {
    return interaction.reply({ content: form.error, ephemeral: true });
  }
  const uploadedFiles = interaction.fields.getUploadedFiles('order-vouch-proof');
  const proofs = uploadedFiles ? [...uploadedFiles.values()] : [];
  const invalidProof = proofs.find((attachment) => (
    !attachment.contentType?.startsWith('image/')
    && !/\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(attachment.name ?? '')
  ));
  if (proofs.length < 1 || proofs.length > 2 || invalidProof) {
    return interaction.reply({ content: 'Upload one or two proof images.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  return presentVouchPreview(interaction, {
    guildId: order.guildId,
    items: `${form.value.product} x ${form.value.quantity}`,
    feedback: form.value.feedback,
    proofs,
    directMessage: true,
  });
}

async function handleVouchPreviewButton(interaction) {
  const [, action, previewId] = interaction.customId.split(':');
  const preview = pendingVouchPreviews.get(previewId);
  if (!preview
    || (preview.directMessage
      ? interaction.inGuild()
      : preview.guildId !== interaction.guildId)
    || preview.userId !== interaction.user.id) {
    return interaction.reply({
      content: 'This vouch preview is no longer available. Please start the vouch again.',
      ephemeral: true,
    });
  }
  if (preview.processing) {
    return interaction.reply({ content: 'Your vouch is already being posted.', ephemeral: true });
  }
  if (action === 'change') {
    discardVouchPreview(previewId);
    return interaction.update({
      content: preview.directMessage
        ? 'Vouch cancelled. Click the Vouch button again to submit a new form.'
        : 'Vouch cancelled. Run `/vouch` again with your changes.',
      embeds: [],
      components: [],
      attachments: [],
    });
  }
  if (action !== 'confirm') {
    return interaction.reply({ content: 'This vouch action is not valid.', ephemeral: true });
  }

  preview.processing = true;
  await interaction.deferUpdate();
  try {
    const channel = await client.channels.fetch(preview.channelId);
    if (!channel
      || channel.guildId !== preview.guildId
      || !channel.isTextBased()
      || typeof channel.send !== 'function') {
      throw new Error(`Vouch channel ${preview.channelId} is unavailable or not a sendable server text channel.`);
    }
    await channel.send({
      embeds: [preview.embed],
      files: [{ attachment: preview.proofCollage, name: 'vouch-proofs.png' }],
      allowedMentions: { parse: [] },
    });
    store.addVouch({
      guildId: preview.guildId,
      userId: preview.userId,
      items: preview.items,
      createdAt: preview.vouchedAt.toISOString(),
    });
    let ownerDmSent = false;
    if (preview.ticketOwnerDmId) {
      try {
        const owner = await client.users.fetch(preview.ticketOwnerDmId);
        await owner.send({
          embeds: [preview.embed],
          files: [{ attachment: preview.proofCollage, name: 'vouch-proofs.png' }],
          allowedMentions: { parse: [] },
        });
        ownerDmSent = true;
      } catch (error) {
        console.error(`Could not DM vouch ${preview.items} to ticket owner ${preview.ticketOwnerDmId}:`, error);
      }
    }
    discardVouchPreview(previewId);
    await interaction.editReply({
      content: `Your vouch was posted in ${channel}.`
        + (preview.ticketOwnerDmId
          ? ownerDmSent
            ? ' A copy was also sent to you by DM.'
            : ' I could not send you a DM copy; please check your DM settings.'
          : ''),
      embeds: [],
      components: [],
      attachments: [],
    });
  } catch (error) {
    preview.processing = false;
    throw error;
  }
}

function discardTicketClosure(confirmationId) {
  const confirmation = pendingTicketClosures.get(confirmationId);
  if (!confirmation) return;
  clearTimeout(confirmation.timeoutId);
  pendingTicketClosures.delete(confirmationId);
}

async function handleTicketCloseConfirmation(interaction) {
  const [, action, confirmationId] = interaction.customId.split(':');
  const confirmation = pendingTicketClosures.get(confirmationId);
  if (!confirmation
    || confirmation.guildId !== interaction.guildId
    || confirmation.userId !== interaction.user.id
    || confirmation.channelId !== interaction.channelId) {
    return interaction.reply({
      content: 'This ticket-close confirmation is no longer available. Please try again.',
      ephemeral: true,
    });
  }
  if (action === 'cancel') {
    discardTicketClosure(confirmationId);
    return interaction.update({
      content: 'Ticket closure cancelled. The ticket remains open.',
      embeds: [],
      components: [],
    });
  }
  if (action !== 'confirm') {
    return interaction.reply({ content: 'This ticket action is not valid.', ephemeral: true });
  }

  const channel = interaction.channel;
  const ownerId = ticketOwnerId(channel);
  if (!channel || !ownerId || ownerId !== confirmation.ownerId) {
    discardTicketClosure(confirmationId);
    return interaction.update({
      content: 'This ticket is no longer active.',
      embeds: [],
      components: [],
    });
  }
  if (confirmation.source === 'customer' && interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'Only the ticket creator can close this ticket.', ephemeral: true });
  }
  if (confirmation.source === 'staff') {
    const settings = store.getSettings(interaction.guildId);
    if (!hasTicketManagerRole(settings, (roleId) => memberHasRole(interaction, roleId))) {
      discardTicketClosure(confirmationId);
      return interaction.update({
        content: 'Your permission to close this ticket has changed. The ticket remains open.',
        embeds: [],
        components: [],
      });
    }
  }
  return interaction.showModal(ticketCloseReasonModal(confirmationId));
}

async function handleTicketCloseReasonModal(interaction) {
  const confirmationId = interaction.customId.slice('ticket-close-reason:'.length);
  const confirmation = pendingTicketClosures.get(confirmationId);
  if (!confirmation
    || confirmation.guildId !== interaction.guildId
    || confirmation.userId !== interaction.user.id
    || confirmation.channelId !== interaction.channelId) {
    return interaction.reply({
      content: 'This ticket-close request is no longer available. Please start the close process again.',
      ephemeral: true,
    });
  }

  const channel = interaction.channel;
  const ownerId = ticketOwnerId(channel);
  if (!channel || !ownerId || ownerId !== confirmation.ownerId) {
    discardTicketClosure(confirmationId);
    return interaction.reply({ content: 'This ticket is no longer active.', ephemeral: true });
  }
  if (confirmation.source === 'customer' && interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'Only the ticket creator can close this ticket.', ephemeral: true });
  }
  if (confirmation.source === 'staff') {
    const settings = store.getSettings(interaction.guildId);
    if (!hasTicketManagerRole(settings, (roleId) => memberHasRole(interaction, roleId))) {
      discardTicketClosure(confirmationId);
      return interaction.reply({
        content: 'Your permission to close this ticket has changed. The ticket remains open.',
        ephemeral: true,
      });
    }
  }

  const reason = interaction.fields.getTextInputValue('ticket-close-reason').trim();
  if (!reason) {
    return interaction.reply({ content: 'Please enter a reason before closing the ticket.', ephemeral: true });
  }
  discardTicketClosure(confirmationId);
  return closeTicketChannel(interaction, channel, ownerId, reason);
}

function scheduleVoidCheckForOrder(order) {
  if (!order || order.status !== 'completed' || order.voidedAt) return;
  const finishedAt = order.finishedAt ? new Date(order.finishedAt).getTime() : Date.now();
  const delay = Math.max(0, finishedAt + 12 * 60 * 60 * 1000 - Date.now());
  if (scheduledVoidChecks.has(order.id)) return;
  const timeoutId = setTimeout(async () => {
    scheduledVoidChecks.delete(order.id);
    const currentOrder = store.getOrder(order.id);
    if (!currentOrder || currentOrder.status !== 'completed' || currentOrder.voidedAt) return;
    if (store.hasVouchSince(currentOrder.guildId, currentOrder.customerId, currentOrder.finishedAt)) return;
    const settings = store.getSettings(currentOrder.guildId);
    const channelId = settings?.voidedChannelId;
    if (!channelId) return;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.guildId !== currentOrder.guildId || !channel.isTextBased() || typeof channel.send !== 'function') {
        return;
      }
      const user = await client.users.fetch(currentOrder.customerId).catch(() => null);
      const embed = voidedOrderEmbed(user ?? { id: currentOrder.customerId, username: `user-${currentOrder.customerId}` }, currentOrder.items ?? currentOrder.item ?? 'Unknown product', 'no vouch within 12hours', new Date());
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      if (settings?.voidedRoleId) {
        const guild = channel.guild;
        const role = await guild.roles.fetch(settings.voidedRoleId).catch(() => null);
        if (role) {
          const member = await guild.members.fetch(currentOrder.customerId).catch(() => null);
          if (member && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
          }
        }
      }
      store.markOrderVoided(currentOrder.id, 'no vouch within 12hours');
    } catch (error) {
      console.error(`Could not void order ${currentOrder.id} after 12 hours without a vouch:`, error);
    }
  }, delay);
  scheduledVoidChecks.set(order.id, timeoutId);
}

async function restoreScheduledVoidChecks() {
  const state = store.read();
  for (const order of state.orders ?? []) {
    if (order.status === 'completed' && !order.voidedAt) {
      scheduleVoidCheckForOrder(order);
    }
  }
}

function memberHasRole(interaction, roleId) {
  const roles = interaction.member?.roles;
  return Array.isArray(roles)
    ? roles.includes(roleId)
    : roles?.cache?.has(roleId) ?? false;
}

function isStaff(interaction) {
  const settings = store.getSettings(interaction.guildId);
  const staffRoleIds = [settings?.staffRoleId, settings?.ownerRoleId].filter(Boolean);
  if (staffRoleIds.length) {
    return staffRoleIds.some((roleId) => memberHasRole(interaction, roleId))
      || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  }
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false;
}

async function postTicketPanel(channel) {
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('The ticket panel must be posted in a sendable text channel.');
  }
  return channel.send({
    components: [ticketPanelButtons()],
  });
}

async function fetchGuildChannelById(guild, channelId) {
  if (!/^\d{17,20}$/.test(channelId ?? '')) {
    throw new Error('Enter a valid Discord channel ID.');
  }
  const channel = await guild.channels.fetch(channelId);
  if (!channel || channel.guildId !== guild.id) {
    throw new Error('The channel ID must belong to this server.');
  }
  return channel;
}

async function getTicketMessages(channel) {
  const messages = [];
  let before;
  let hasMore = true;
  while (hasMore) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    const oldest = batch.reduce((result, message) => (
      !result || message.createdTimestamp < result.createdTimestamp ? message : result
    ), null);
    before = oldest.id;
    hasMore = batch.size === 100;
  }
  return messages.sort((first, second) => first.createdTimestamp - second.createdTimestamp);
}

async function requestTicketClosure(interaction, channel, ownerId, source) {
  const settings = store.getSettings(interaction.guildId);
  if (!settings?.ticketTranscriptChannelId) {
    return interaction.reply({ content: 'Ticket transcripts are not configured. Ask an administrator to run `/set ticket_transcript channel:#channel` before closing tickets.', ephemeral: true });
  }
  const confirmationId = randomUUID();
  const timeoutId = setTimeout(() => discardTicketClosure(confirmationId), TICKET_CLOSE_CONFIRMATION_DURATION_MS);
  timeoutId.unref();
  pendingTicketClosures.set(confirmationId, {
    guildId: interaction.guildId,
    channelId: channel.id,
    ownerId,
    userId: interaction.user.id,
    source,
    timeoutId,
  });
  return interaction.reply({
    embeds: [ticketCloseConfirmationEmbed(channel)],
    components: [ticketCloseConfirmationButtons(confirmationId)],
    allowedMentions: { parse: [] },
    ephemeral: true,
  });
}

async function closeTicketChannel(interaction, channel, ownerId, reason) {
  const settings = store.getSettings(interaction.guildId);
  if (!settings?.ticketTranscriptChannelId) {
    return interaction.reply({ content: 'Ticket transcripts are not configured. Ask an administrator to run `/set ticket_transcript channel:#channel` before closing tickets.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const transcriptChannel = await client.channels.fetch(settings.ticketTranscriptChannelId);
  if (!transcriptChannel?.isTextBased() || typeof transcriptChannel.send !== 'function') {
    throw new Error(`Configured transcript channel ${settings.ticketTranscriptChannelId} is not a sendable text channel.`);
  }
  const messages = await getTicketMessages(channel);
  const transcript = ticketTranscriptText(messages);
  const claimedMatch = channel.topic.match(/(?:^|;)ticket-claimed:(\d+)(?:;|$)/);
  const transcriptEmbed = ticketTranscriptEmbed({
    channelId: channel.id,
    createdAt: channel.createdAt,
    ownerId,
    closedById: interaction.user.id,
    claimedById: claimedMatch?.[1],
    reason,
  });
  const transcriptFile = {
    attachment: Buffer.from(transcript || 'No messages in this ticket.', 'utf8'),
    name: `${channel.name.replace(/[^a-z0-9-]/gi, '-')}-transcript.txt`,
  };
  await transcriptChannel.send({
    embeds: [transcriptEmbed],
    files: [transcriptFile],
    allowedMentions: { parse: [] },
  });
  let ownerNotified = true;
  try {
    const owner = await client.users.fetch(ownerId);
    await owner.send({
      embeds: [transcriptEmbed],
      files: [transcriptFile],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    ownerNotified = false;
    console.error(`Could not DM the ticket transcript for ${channel.id} to owner ${ownerId}:`, error);
  }
  await channel.delete(`Ticket closed by ${interaction.user.tag}; transcript posted in ${transcriptChannel.id}`);
  return interaction.editReply(
    `Ticket closed and deleted. Transcript posted in ${transcriptChannel}.`
    + (ownerNotified ? ' A copy was also sent to the ticket owner by DM.' : ' I could not DM the ticket owner; they may have DMs disabled.'),
  );
}

function isOrderStaff(interaction) {
  const settings = store.getSettings(interaction.guildId);
  const orderRoleIds = [settings?.adminRoleId, settings?.staffRoleId, settings?.ownerRoleId].filter(Boolean);
  if (!orderRoleIds.length) return isStaff(interaction);
  return orderRoleIds.some((roleId) => memberHasRole(interaction, roleId))
    || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function canUseOrderButtons(interaction) {
  const settings = store.getSettings(interaction.guildId);
  if (!settings?.ownerRoleId) return isStaff(interaction);
  return interaction.guild?.ownerId === interaction.user.id
    || memberHasRole(interaction, settings.ownerRoleId);
}

async function refreshOrderMessage(order) {
  if (!order.channelId || !order.messageId) return;
  const channel = await client.channels.fetch(order.channelId);
  const message = await channel.messages.fetch(order.messageId);
  await message.edit({
    components: [orderContainer(order)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

async function deleteStickyPost(channel, messageId) {
  if (!messageId) return;
  try {
    const stickyPost = await channel.messages.fetch(messageId);
    await stickyPost.delete();
  } catch (error) {
    if (error.code !== 10008) throw error;
  }
}

async function refreshStickyMessage(message) {
  if (!message.guildId || message.author.bot || message.webhookId || !message.channel?.send) return;
  const { guildId, channelId } = message;
  const key = `${guildId}:${channelId}`;
  const previousRefresh = stickyRefreshes.get(key) ?? Promise.resolve();
  const refresh = previousRefresh.catch(() => {}).then(async () => {
    const stickyMessage = store.getStickyMessage(guildId, channelId);
    if (!stickyMessage) return;
    await deleteStickyPost(message.channel, stickyMessage.messageId);
    const postedMessage = await message.channel.send({
      content: stickyMessage.content,
      allowedMentions: { parse: [] },
    });
    store.setStickyMessage(guildId, channelId, stickyMessage.content, postedMessage.id);
  });
  stickyRefreshes.set(key, refresh);
  try {
    await refresh;
  } catch (error) {
    console.error(`Could not refresh sticky message in channel ${channelId}:`, error);
  } finally {
    if (stickyRefreshes.get(key) === refresh) stickyRefreshes.delete(key);
  }
}

async function withTicketClaimLock(channelId, action) {
  const previous = ticketClaimLocks.get(channelId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  ticketClaimLocks.set(channelId, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (ticketClaimLocks.get(channelId) === current) ticketClaimLocks.delete(channelId);
  }
}

async function createTicketChannel(interaction, type, orderForm, reportForm, othersForm) {
  const guild = interaction.guild;
  if (!guild) throw new Error('Tickets can only be created in a server.');
  return withTicketCreationLock(`${guild.id}:${interaction.user.id}`, async () => {
    const channels = await guild.channels.fetch();
    const existingTicket = findActiveTicket(channels, interaction.user.id);
    if (existingTicket) return { channel: existingTicket, created: false };

    const settings = store.getSettings(interaction.guildId);
    const ticketRoleIds = ticketAccessRoleIds(settings);
    for (const roleId of ticketRoleIds) {
      if (!guild.roles.cache.has(roleId)) {
        throw new Error(`Configured ticket role ${roleId} no longer exists.`);
      }
    }
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      ticketOwnerPermissionOverwrite(interaction.user.id, type),
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];
    for (const roleId of ticketRoleIds) {
      permissionOverwrites.push(ticketAccessRolePermissionOverwrite(roleId, type));
    }
    let parent;
    const categorySettingKey = {
      order: 'ticketOrderCategoryId',
      report: 'ticketReportCategoryId',
      others: 'ticketOthersCategoryId',
    }[type];
    const categoryId = settings?.[categorySettingKey] ?? settings?.ticketCategoryId;
    if (categoryId) {
      parent = await fetchGuildChannelById(guild, categoryId);
      if (parent.type !== ChannelType.GuildCategory) {
        throw new Error(`Configured ticket category ${categoryId} is not a category.`);
      }
    }

    const channel = await guild.channels.create({
      name: ticketChannelName(
        type,
        interaction.user.username,
        orderForm?.product ?? reportForm?.product ?? othersForm?.type,
      ),
      type: ChannelType.GuildText,
      ...(parent ? { parent: parent.id } : {}),
      topic: `ticket-owner:${interaction.user.id};ticket-type:${type}${type === 'order' ? ';ticket-terms-required' : ''}${orderForm ? `;ticket-product:${orderForm.product}` : ''}`,
      permissionOverwrites,
      reason: `${type} ticket opened by ${interaction.user.tag}`,
    });
    await channel.send({
      ...ticketManagerMentionPayload(settings),
      embeds: [ticketEmbed(type, interaction.user, orderForm, reportForm, othersForm)],
      components: [ticketButtons()],
      allowedMentions: { parse: [] },
    });
    if (type === 'order') {
      await channel.send({
        components: [orderTicketTermsContainer()],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
    return { channel, created: true };
  });
}

async function handleCommand(interaction) {
  if (interaction.commandName === 'help') {
    return interaction.reply({
      embeds: [helpEmbed(commands)],
      allowedMentions: { parse: [] },
    });
  }

  if (interaction.commandName === 'ticketsetup') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only server administrators can post the ticket panel.', ephemeral: true });
    }
    await postTicketPanel(interaction.channel);
    return interaction.reply({ content: `Ticket panel posted in ${interaction.channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'setupticketcategory') {
    const categoryId = interaction.options.getString('category_id', true).trim();
    let category;
    try {
      category = await fetchGuildChannelById(interaction.guild, categoryId);
    } catch (error) {
      return interaction.reply({ content: error.message, ephemeral: true });
    }
    if (category.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: 'That ID is not a category in this server.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, { ticketCategoryId: category.id });
    return interaction.reply({ content: `New ticket channels will be created in **${category.name}**.`, ephemeral: true });
  }

  const ticketCategorySettings = {
    ordercategory: ['ticketOrderCategoryId', 'order'],
    reportcategory: ['ticketReportCategoryId', 'report'],
    othercategory: ['ticketOthersCategoryId', 'other'],
  };
  if (ticketCategorySettings[interaction.commandName]) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only server administrators can configure ticket categories.', ephemeral: true });
    }
    const [settingKey, label] = ticketCategorySettings[interaction.commandName];
    const categoryId = interaction.options.getString('category_id', true).trim();
    let category;
    try {
      category = await fetchGuildChannelById(interaction.guild, categoryId);
    } catch (error) {
      return interaction.reply({ content: error.message, ephemeral: true });
    }
    if (category.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: 'That ID is not a category in this server.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, { [settingKey]: category.id });
    return interaction.reply({ content: `New ${label} tickets will be created in **${category.name}**.`, ephemeral: true });
  }

  if (interaction.commandName === 'ticket' && interaction.options.getSubcommand() === 'setup') {
    const channel = interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return interaction.reply({ content: 'Run `/ticket setup` in a server text channel.', ephemeral: true });
    }
    const staffRole = interaction.options.getRole('staff_role');
    if (staffRole) {
      store.setSettings(interaction.guildId, { ticketStaffRoleId: staffRole.id });
    }
    await postTicketPanel(channel);
    return interaction.reply({ content: `Ticket panel posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'setup') {
    const channel = interaction.options.getChannel('channel');
    const staffRole = interaction.options.getRole('staff_role');
    if (!channel.isTextBased() || !channel.messages) {
      return interaction.reply({ content: 'Choose a server text channel.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, {
      channelId: channel.id,
      staffRoleId: staffRole?.id ?? null,
    });
    const roleText = staffRole ? ` Staff actions are limited to ${staffRole}.` : ' Staff actions require Manage Messages permission.';
    return interaction.reply({ content: `Order posts will be sent to ${channel}.${roleText}`, ephemeral: true });
  }

  if (interaction.commandName === 'set' && interaction.options.getSubcommand() === 'vouch') {
    const channel = interaction.options.getChannel('channel', true);
    store.setSettings(interaction.guildId, { vouchChannelId: channel.id });
    return interaction.reply({ content: `Vouches will be posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'set' && interaction.options.getSubcommand() === 'ticket_transcript') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choose a text channel in this server.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, { ticketTranscriptChannelId: channel.id });
    return interaction.reply({ content: `Closed ticket transcripts will be posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'set' && interaction.options.getSubcommand() === 'voided') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choose a text channel in this server.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, { voidedChannelId: channel.id });
    return interaction.reply({ content: `Voided-order alerts will be posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'set' && interaction.options.getSubcommand() === 'voided_role') {
    const role = interaction.options.getRole('role', true);
    store.setSettings(interaction.guildId, { voidedRoleId: role.id });
    return interaction.reply({ content: `${role} will be granted to members marked as voided.`, ephemeral: true });
  }

  if (interaction.commandName === 'setowner') {
    if (interaction.guild?.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'Only the server owner can set the order owner role.', ephemeral: true });
    }
    const role = interaction.options.getRole('role', true);
    store.setSettings(interaction.guildId, { ownerRoleId: role.id });
    return interaction.reply({ content: `${role} and the server owner can now use order buttons.`, ephemeral: true });
  }

  if (interaction.commandName === 'setadmin') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only a server administrator can set the order role.', ephemeral: true });
    }
    const role = interaction.options.getRole('role', true);
    store.setSettings(interaction.guildId, { adminRoleId: role.id });
    return interaction.reply({ content: `${role} can now use /order and /claim.`, ephemeral: true });
  }

  if (interaction.commandName === 'setorder') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only a server administrator can set the order channel.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel', true);
    store.setSettings(interaction.guildId, { orderChannelId: channel.id });
    return interaction.reply({ content: `New orders will be posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'order') {
    if (!isOrderStaff(interaction)) {
      return interaction.reply({ content: 'Only staff can submit orders.', ephemeral: true });
    }
    const settings = store.getSettings(interaction.guildId);
    if (!settings) {
      return interaction.reply({ content: 'The order channel has not been set up yet. Ask an administrator to run `/setup`.', ephemeral: true });
    }
    const orderChannelId = settings.orderChannelId ?? settings.channelId;
    if (!orderChannelId) {
      return interaction.reply({ content: 'The order channel has not been set up yet. Ask an administrator to run `/setorder channel:#channel`.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const customerId = ticketCustomerId(interaction.channel, interaction.user.id);
    const order = store.addOrder({
      guildId: interaction.guildId,
      customerId,
      sourceChannelId: interaction.channelId,
      items: interaction.options.getString('items', true),
      paymentMethod: interaction.options.getString('payment_method', true),
      supporterId: interaction.options.getUser('supporter', true).id,
      quantity: interaction.options.getInteger('quantity') ?? 1,
      ticketProduct: await ticketProduct(interaction.channel),
    });
    const channel = await client.channels.fetch(orderChannelId);
    const message = await channel.send({
      components: [orderContainer(order)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    store.setOrderMessage(order.id, channel.id, message.id);
    return interaction.editReply(`Order #${orderReference(order)} was added to ${channel}.`);
  }

  if (interaction.commandName === 'queue') {
    return interaction.reply({
      embeds: [queueEmbed(store.listActive(interaction.guildId))],
      allowedMentions: { parse: [] },
    });
  }

  if (interaction.commandName === 'solving') {
    const result = multiplyAmounts(
      interaction.options.getNumber('amount_one', true),
      interaction.options.getNumber('amount_two', true),
    );
    if (!result) {
      return interaction.reply({ content: 'The result is too large to calculate.', ephemeral: true });
    }
    return interaction.reply({
      embeds: [multiplicationEmbed(result)],
      allowedMentions: { parse: [] },
    });
  }

  if (interaction.commandName === 'claim') {
    if (!isOrderStaff(interaction)) {
      return interaction.reply({ content: 'You do not have permission to claim orders.', ephemeral: true });
    }
    const order = store.claimNext(interaction.guildId, interaction.user.id);
    if (!order) return interaction.reply({ content: 'There are no waiting orders to claim.', ephemeral: true });
    try {
      await refreshOrderMessage(order);
    } catch (error) {
      console.error('Could not refresh claimed order post:', error);
    }
    return interaction.reply({ content: `You claimed order #${orderReference(order)}: **${order.items ?? order.item}** × ${order.quantity}.`, ephemeral: true });
  }

  if (interaction.commandName === 'message') {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'You do not have permission to post messages as the bot.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return interaction.reply({ content: 'Choose a text channel where the bot can send messages.', ephemeral: true });
    }
    const text = interaction.options.getString('text', true);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x3478c7)
        .setDescription(text)],
      allowedMentions: { parse: [] },
    });
    return interaction.reply({ content: `Message posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'vouch') {
    const settings = store.getSettings(interaction.guildId);
    if (!settings?.vouchChannelId) {
      return interaction.reply({ content: 'The vouch channel has not been set. Ask an administrator to run `/set vouch channel:#channel`.', ephemeral: true });
    }
    const items = interaction.options.getString('items', true).trim();
    const feedback = interaction.options.getString('feedback', true).trim();
    const proofs = ['proof', 'proof2']
      .map((name) => interaction.options.getAttachment(name))
      .filter(Boolean);
    if (!items || !feedback) {
      return interaction.reply({ content: 'Items and feedback cannot be blank.', ephemeral: true });
    }
    if (proofs.length < 1) {
      return interaction.reply({ content: 'Please attach at least one proof image.', ephemeral: true });
    }
    const invalidProof = proofs.find((attachment) => (
      !attachment.contentType?.startsWith('image/')
      && !/\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(attachment.name ?? '')
    ));
    if (invalidProof) {
      return interaction.reply({ content: 'Proof uploads must be image files.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    return presentVouchPreview(interaction, {
      guildId: interaction.guildId,
      items,
      feedback,
      proofs,
      ticketOwnerDmId: ticketOwnerId(interaction.channel) === interaction.user.id
        ? interaction.user.id
        : null,
      directMessage: false,
    });
  }

  if (interaction.commandName === 'checkvouch') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const vouches = store.listVouches(interaction.guildId, user.id);
    const lines = [];
    let characterCount = 0;
    for (const vouch of vouches) {
      const date = new Date(vouch.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Manila',
      });
      const line = `${date} - ${vouch.items}`;
      if (characterCount + line.length + 1 > 3500) break;
      lines.push(line);
      characterCount += line.length + 1;
    }
    const remaining = vouches.length - lines.length;
    const description = [
      `**Check vouch:** <@${user.id}>`,
      `**Total no. of vouches:** ${vouches.length}`,
      '',
      lines.length ? lines.join('\n') : 'No vouches recorded yet.',
      remaining > 0 ? `\n...and ${remaining} more vouches.` : '',
    ].join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x35a16b)
      .setTitle('Vouch History')
      .setDescription(description);
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }

  if (interaction.commandName === 'stickymessage') {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'You do not have permission to manage sticky messages.', ephemeral: true });
    }
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choose a text channel in this server.', ephemeral: true });
    }

    if (subcommand === 'set') {
      const content = interaction.options.getString('text', true);
      const postedMessage = await channel.send({ content, allowedMentions: { parse: [] } });
      const previousSticky = store.setStickyMessage(interaction.guildId, channel.id, content, postedMessage.id);
      if (previousSticky?.messageId) {
        try {
          await deleteStickyPost(channel, previousSticky.messageId);
        } catch (error) {
          console.error(`Could not delete previous sticky message in channel ${channel.id}:`, error);
        }
      }
      return interaction.reply({ content: `Sticky message set in ${channel}.`, ephemeral: true });
    }

    const stickyMessage = store.removeStickyMessage(interaction.guildId, channel.id);
    if (!stickyMessage) {
      return interaction.reply({ content: `There is no sticky message set in ${channel}.`, ephemeral: true });
    }
    await deleteStickyPost(channel, stickyMessage.messageId);
    return interaction.reply({ content: `Sticky message removed from ${channel}.`, ephemeral: true });
  }
}

async function handleTicketButton(interaction) {
  if (interaction.customId === 'ticket:terms-agree') {
    const channel = interaction.channel;
    const ownerId = ticketOwnerId(channel);
    if (!channel || !ownerId || ownerId !== interaction.user.id || !ticketTermsRequired(channel)) {
      return interaction.reply({ content: 'Only the owner of this order ticket can accept its terms.', ephemeral: true });
    }
    if (ticketTermsAccepted(channel)) {
      return interaction.reply({ content: 'You have already accepted these terms.', ephemeral: true });
    }

    await interaction.deferUpdate();
    await channel.permissionOverwrites.edit(ownerId, {
      ViewChannel: true,
      SendMessages: true,
      SendMessagesInThreads: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });
    const settings = store.getSettings(interaction.guildId);
    for (const roleId of ticketAccessRoleIds(settings)) {
      await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        SendMessagesInThreads: true,
        ReadMessageHistory: true,
      });
    }
    await channel.setTopic(`${channel.topic};ticket-terms-accepted`);
    await interaction.message.edit({
      components: [orderTicketTermsContainer(true)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return interaction.followUp({
      content: 'You agreed to the terms. You can now send messages in this ticket.',
      ephemeral: true,
    });
  }

  if (interaction.customId === 'ticket:order') {
    return interaction.showModal(orderTicketModal());
  }
  if (interaction.customId === 'ticket:report') {
    return interaction.showModal(reportTicketModal());
  }
  if (interaction.customId === 'ticket:others') {
    return interaction.showModal(othersTicketModal());
  }
  if (interaction.customId === 'ticket:claim') {
    const channel = interaction.channel;
    const ownerMatch = channel?.topic?.match(/(?:^|;)ticket-owner:(\d+)(?:;|$)/);
    if (!channel || !ownerMatch) {
      return interaction.reply({ content: 'This channel is not an active ticket.', ephemeral: true });
    }
    if (ticketTermsRequired(channel) && !ticketTermsAccepted(channel)) {
      return interaction.reply({ content: 'The ticket owner must accept the terms before this ticket can be claimed.', ephemeral: true });
    }
    const settings = store.getSettings(interaction.guildId);
    const ticketRoleIds = ticketAccessRoleIds(settings);
    const managerRoleIds = ticketManagerRoleIds(settings);
    if (!managerRoleIds.some((roleId) => memberHasRole(interaction, roleId))) {
      return interaction.reply({ content: 'Only members with the configured `/setadmin` or `/setowner` role can claim tickets.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    return withTicketClaimLock(channel.id, async () => {
      const currentChannel = await channel.guild.channels.fetch(channel.id);
      if (currentChannel.name.startsWith('closed-')) {
        return interaction.editReply('This ticket has already been closed.');
      }
      const claimedMatch = currentChannel.topic?.match(/(?:^|;)ticket-claimed:(\d+)(?:;|$)/);
      if (claimedMatch) {
        return interaction.editReply(`This ticket has already been claimed by <@${claimedMatch[1]}>.`);
      }

      for (const roleId of ticketRoleIds) {
        await currentChannel.permissionOverwrites.edit(roleId, {
          SendMessages: false,
          SendMessagesInThreads: false,
        });
      }
      await currentChannel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true,
        SendMessagesInThreads: true,
        ReadMessageHistory: true,
      });
      await currentChannel.setTopic(`${currentChannel.topic};ticket-claimed:${interaction.user.id}`);
      await interaction.message.edit({
        content: `Claimed by <@${interaction.user.id}>`,
        components: [ticketButtons(true)],
        allowedMentions: { parse: [] },
      });
      return interaction.editReply('You claimed this ticket. Other ticket staff can view it but cannot send messages.');
    });
  }
  if (interaction.customId === 'ticket:unclaim') {
    const channel = interaction.channel;
    const ownerMatch = channel?.topic?.match(/(?:^|;)ticket-owner:(\d+)(?:;|$)/);
    if (!channel || !ownerMatch) {
      return interaction.reply({ content: 'This channel is not an active ticket.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    return withTicketClaimLock(channel.id, async () => {
      const currentChannel = await channel.guild.channels.fetch(channel.id);
      const claimedMatch = currentChannel.topic?.match(/(?:^|;)ticket-claimed:(\d+)(?:;|$)/);
      if (!claimedMatch) {
        return interaction.editReply('This ticket is not currently claimed.');
      }
      if (claimedMatch[1] !== interaction.user.id) {
        return interaction.editReply('Only the staff member who claimed this ticket can unclaim it.');
      }

      const settings = store.getSettings(interaction.guildId);
      for (const roleId of ticketAccessRoleIds(settings)) {
        await currentChannel.permissionOverwrites.edit(roleId, {
          SendMessages: true,
          SendMessagesInThreads: true,
        });
      }
      if (interaction.user.id !== ownerMatch[1]) {
        await currentChannel.permissionOverwrites.delete(interaction.user.id);
      }
      await currentChannel.setTopic(currentChannel.topic.replace(/;ticket-claimed:\d+/, ''));
      await interaction.message.edit({
        content: 'Ticket unclaimed and available for another staff member to claim.',
        components: [ticketButtons()],
        allowedMentions: { parse: [] },
      });
      return interaction.editReply('You unclaimed this ticket. Another authorized staff member can now claim it.');
    });
  }
  if (interaction.customId === 'ticket:close') {
    const channel = interaction.channel;
    const ownerId = ticketOwnerId(channel);
    if (!channel || !ownerId) {
      return interaction.reply({ content: 'This channel is not an active ticket.', ephemeral: true });
    }
    const settings = store.getSettings(interaction.guildId);
    if (!hasTicketManagerRole(settings, (roleId) => memberHasRole(interaction, roleId))) {
      return interaction.reply({ content: 'Only members with the configured `/setadmin` or `/setowner` role can close tickets.', ephemeral: true });
    }
    return requestTicketClosure(interaction, channel, ownerId, 'staff');
  }
}

async function handleTicketModal(interaction) {
  if (interaction.customId === 'ticket:others-form') {
    const result = parseOthersTicketForm({
      type: interaction.fields.getTextInputValue('ticket-others-message'),
    });
    if (result.error) {
      return interaction.reply({ content: result.error, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const ticketResult = await createTicketChannel(interaction, 'others', undefined, undefined, result.value);
    if (!ticketResult.created) {
      return interaction.editReply(`You already have an active ticket: ${ticketResult.channel}. Close it before opening another.`);
    }
    return interaction.editReply(`Your others ticket is ready: ${ticketResult.channel}`);
  }

  if (interaction.customId === 'ticket:report-form') {
    const reportForm = {
      product: interaction.fields.getTextInputValue('ticket-report-product').trim(),
      issue: interaction.fields.getTextInputValue('ticket-report-issue').trim(),
      readRules: interaction.fields.getTextInputValue('ticket-report-rules').trim(),
    };
    if (Object.values(reportForm).some((value) => !value)) {
      return interaction.reply({ content: 'Please fill in all report form fields.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const result = await createTicketChannel(interaction, 'report', undefined, reportForm);
    if (!result.created) {
      return interaction.editReply(`You already have an active ticket: ${result.channel}. Close it before opening another.`);
    }
    return interaction.editReply(`Your report ticket is ready: ${result.channel}`);
  }

  const submittedOrderForm = {
    product: interaction.fields.getTextInputValue('ticket-product').trim(),
    quantity: interaction.fields.getTextInputValue('ticket-quantity').trim(),
    paymentMethod: interaction.fields.getTextInputValue('ticket-payment-method').trim(),
  };
  const result = parseOrderTicketForm(submittedOrderForm);
  if (result.error) {
    return interaction.reply({ content: result.error, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const ticketResult = await createTicketChannel(interaction, 'order', result.value);
  if (!ticketResult.created) {
    return interaction.editReply(`You already have an active ticket: ${ticketResult.channel}. Close it before opening another.`);
  }
  return interaction.editReply(`Your order ticket is ready: ${ticketResult.channel}`);
}

async function handleButton(interaction) {
  if (!canUseOrderButtons(interaction)) {
    return interaction.reply({ content: 'Only the configured owner role can update order buttons.', ephemeral: true });
  }
  const [, action, orderId] = interaction.customId.split(':');
  const order = action === 'processing'
    ? store.markProcessing(orderId, interaction.user.id)
    : store.finishOrder(orderId, action === 'complete' ? 'completed' : 'cancelled');
  if (!order || order.guildId !== interaction.guildId) {
    return interaction.reply({ content: 'This order is no longer active.', ephemeral: true });
  }
  await interaction.update({
    components: [orderContainer(order)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  const statusEmbed = orderStatusEmbed(order);
  const completionReminder = action === 'complete' ? orderCompletionReminderContainer(order.id) : null;
  const notificationFailures = [];
  if (action === 'complete') {
    scheduleVoidCheckForOrder(order);
  }
  if (order.sourceChannelId) {
    try {
      const sourceChannel = await client.channels.fetch(order.sourceChannelId);
      if (!sourceChannel
        || sourceChannel.guildId !== interaction.guildId
        || !sourceChannel.isTextBased()
        || typeof sourceChannel.send !== 'function') {
        throw new Error(`Order source channel ${order.sourceChannelId} is unavailable or not a sendable server text channel.`);
      }
      await sourceChannel.send({
        embeds: [statusEmbed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(`Could not send status update for order ${order.id} to source channel ${order.sourceChannelId}:`, error);
      notificationFailures.push(`the original order channel <#${order.sourceChannelId}>`);
    }
  }
  try {
    const customer = await client.users.fetch(order.customerId);
    await customer.send({ embeds: [statusEmbed], allowedMentions: { parse: [] } });
    if (completionReminder) {
      await customer.send({
        components: [completionReminder],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    console.error(`Could not DM order status update for order ${order.id} to customer ${order.customerId}:`, error);
    notificationFailures.push('the order submitter by DM');
  }
  if (notificationFailures.length) {
    await interaction.followUp({
      content: `Order status was updated, but I could not notify ${notificationFailures.join(' and ')}.`,
      ephemeral: true,
    });
  }
}

async function handlePaymentButton(interaction) {
  const channel = interaction.channel;
  const ownerId = ticketOwnerId(channel);
  if (!channel || !ownerId) {
    return interaction.reply({ content: 'Payment buttons only work inside an active ticket.', ephemeral: true });
  }
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'Only the ticket creator can use these payment buttons.', ephemeral: true });
  }
  if (interaction.customId === 'payment:yes') {
    return interaction.reply({
      embeds: [paymentDetailsEmbed()],
      files: [{
        attachment: path.join(__dirname, '..', 'assets', 'gcash-payment.png'),
        name: 'gcash-payment.png',
      }],
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
  }
  if (interaction.customId === 'payment:no') {
    return requestTicketClosure(interaction, channel, ownerId, 'customer');
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await restoreScheduledVoidChecks();
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('vouch-preview:')) await handleVouchPreviewButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('ticket-close:')) await handleTicketCloseConfirmation(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('ticket:')) await handleTicketButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('order:vouch:')) await handleOrderVouchButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('order:')) await handleButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('payment:')) await handlePaymentButton(interaction);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-close-reason:')) {
      await handleTicketCloseReasonModal(interaction);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('order-vouch-form:')) {
      await handleOrderVouchModal(interaction);
    }
    else if (interaction.isModalSubmit() && [
      'ticket:order-form',
      'ticket:report-form',
      'ticket:others-form',
    ].includes(interaction.customId)) {
      await handleTicketModal(interaction);
    }
  } catch (error) {
    console.error('Interaction failed:', error);
    const response = { content: 'Something went wrong while handling that request. Please try again.', ephemeral: true };
    if (interaction.deferred) await interaction.editReply(response);
    else if (interaction.isRepliable() && !interaction.replied) await interaction.reply(response);
  }
});

client.on('messageCreate', async (message) => {
  const messageCommand = !message.author.bot && message.guild
    ? parseTicketMessageCommand(message.content)
    : null;
  try {
    if (messageCommand?.name === 'calc') {
      const result = messageCommand.args.length
        ? multiplyExpression(messageCommand.args.join(' '))
        : null;
      if (!result) {
        await message.reply('Usage: `,calc <number>*<number>` — enter two finite numbers separated by `*`.');
        return;
      }
      const deleteError = await replyThenDeleteCommand(
        message,
        {
          embeds: [multiplicationEmbed(result)],
          allowedMentions: { parse: [] },
        },
      );
      if (deleteError) {
        console.error(`Could not delete calc command message ${message.id}:`, deleteError);
        await message.channel.send('I solved the calculation, but could not delete your command. Please check that I have the Manage Messages permission.');
      }
      return;
    }
    await refreshStickyMessage(message);
  } catch (error) {
    console.error(messageCommand ? `Could not handle ,${messageCommand.name}:` : 'Message handling failed:', error);
    if (messageCommand) {
      try {
        await message.reply('Could not run that command. Check that the bot can send messages and embeds in this channel.');
      } catch (replyError) {
        console.error('Could not report message command failure:', replyError);
      }
    }
  }
});

if (!process.env.DISCORD_TOKEN) throw new Error('Set DISCORD_TOKEN in your .env file.');
client.login(process.env.DISCORD_TOKEN);