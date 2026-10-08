require('dotenv').config();

const {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { OrderStore, ORDER_ACTIVE_DURATION_MS } = require('./store');
const {
  orderButtons,
  orderContainer,
  orderStatusEmbed,
  orderCompletionReminderEmbed,
  multiplicationContainer,
  paymentReminderEmbed,
  vouchEmbed,
  vouchPreviewButtons,
  voidedOrderEmbed,
  paymentDetailsEmbed,
  paymentReminderButtons,
  orderTicketTermsContainer,
  vouchLinkButton,
  robuxFormContainer,
  openShopContainer,
  closeShopContainer,
  giveawayContainer,
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
  ticketQuantity,
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
const { parseOthersTicketForm } = require('./others-ticket-form');
const { multiplyAmounts, multiplyExpression } = require('./multiplication');
const { replyThenDeleteCommand } = require('./message-command-actions');
const {
  sendV2,
  wrapInteractionResponses,
  wrapMessageResponses,
} = require('./v2-messages');
const commands = require('./commands');
const { parseGiveawayDuration, selectGiveawayWinners } = require('./giveaway-utils');

const store = new OrderStore();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const stickyRefreshes = new Map();
const ticketClaimLocks = new Map();
const scheduledVoidChecks = new Map();
const scheduledOrderExpirations = new Map();
const scheduledGiveawayEnds = new Map();
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

async function handleVouchPreviewButton(interaction) {
  const [, action, previewId] = interaction.customId.split(':');
  const preview = pendingVouchPreviews.get(previewId);
  if (!preview
    || preview.guildId !== interaction.guildId
    || preview.userId !== interaction.user.id) {
    return interaction.reply({
      content: 'This vouch preview is no longer available. Please run `/vouch` again.',
      ephemeral: true,
    });
  }
  if (preview.processing) {
    return interaction.reply({ content: 'Your vouch is already being posted.', ephemeral: true });
  }
  if (action === 'change') {
    discardVouchPreview(previewId);
    return interaction.update({
      content: 'Vouch cancelled. Run `/vouch` again with your changes.',
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
      || channel.guildId !== interaction.guildId
      || !channel.isTextBased()
      || typeof channel.send !== 'function') {
      throw new Error(`Vouch channel ${preview.channelId} is unavailable or not a sendable server text channel.`);
    }
    await sendV2(channel, {
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
        await sendV2(owner, {
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
    if (preview.ticketChannelId) {
      try {
        const ticketChannel = await client.channels.fetch(preview.ticketChannelId);
        if (ticketChannel && ticketChannel.guildId === preview.guildId
          && ticketOwnerId(ticketChannel) === preview.userId) {
          return await closeTicketChannel(interaction, ticketChannel, preview.userId, 'Vouch submitted');
        }
      } catch (error) {
        console.error(`Could not automatically close ticket ${preview.ticketChannelId} after vouch:`, error);
        return interaction.editReply({
          content: 'Your vouch was posted, but I could not automatically close the ticket. Please close it manually or contact staff.',
          embeds: [],
          components: [],
          attachments: [],
        });
      }
    }
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
      await sendV2(channel, { embeds: [embed], allowedMentions: { parse: [] } });
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

function scheduleOrderExpiration(order) {
  if (!order || !['pending', 'claimed'].includes(order.status) || scheduledOrderExpirations.has(order.id)) return;
  const createdAt = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return;
  const delay = Math.max(0, createdAt + ORDER_ACTIVE_DURATION_MS - Date.now());
  const timeoutId = setTimeout(async () => {
    scheduledOrderExpirations.delete(order.id);
    try {
      store.listActive(order.guildId);
      const currentOrder = store.getOrder(order.id);
      if (currentOrder?.status === 'expired') await refreshOrderMessage(currentOrder);
    } catch (error) {
      console.error(`Could not expire order ${order.id}:`, error);
    }
  }, delay);
  scheduledOrderExpirations.set(order.id, timeoutId);
}

async function finishGiveaway(guildId, giveawayId) {
  const giveaway = store.getGiveaway(guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') return null;
  const winners = selectGiveawayWinners(giveaway.entrants, giveaway.winnerCount);
  const endedGiveaway = store.endGiveaway(guildId, giveawayId, winners);
  if (!endedGiveaway) return null;
  scheduledGiveawayEnds.delete(giveawayId);
  try {
    const channel = await client.channels.fetch(endedGiveaway.channelId);
    if (!channel || channel.guildId !== guildId || !channel.isTextBased()) {
      throw new Error(`Giveaway channel ${endedGiveaway.channelId} is unavailable.`);
    }
    const message = await channel.messages.fetch(endedGiveaway.messageId);
    await message.edit({
      components: [giveawayContainer(endedGiveaway, true)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    await sendV2(channel, {
      content: winners.length
        ? `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${endedGiveaway.prize}**.`
        : `The giveaway for **${endedGiveaway.prize}** ended with no eligible entrants.`,
      allowedMentions: { users: winners },
    });
    return endedGiveaway;
  } catch (error) {
    console.error(`Could not publish results for giveaway ${giveawayId}:`, error);
    throw error;
  }
}

function scheduleGiveawayEnd(giveaway) {
  if (!giveaway || giveaway.status !== 'active' || scheduledGiveawayEnds.has(giveaway.id)) return;
  const delay = Math.max(0, new Date(giveaway.endsAt).getTime() - Date.now());
  const timeoutId = setTimeout(() => {
    scheduledGiveawayEnds.delete(giveaway.id);
    if (Date.now() < new Date(giveaway.endsAt).getTime()) {
      scheduleGiveawayEnd(giveaway);
      return;
    }
    finishGiveaway(giveaway.guildId, giveaway.id).catch((error) => {
      console.error(`Could not automatically end giveaway ${giveaway.id}:`, error);
    });
  }, Math.min(delay, 2_147_000_000));
  scheduledGiveawayEnds.set(giveaway.id, timeoutId);
}

function canManageGiveaways(interaction) {
  const settings = store.getSettings(interaction.guildId);
  const managerRoleIds = [settings?.adminRoleId, settings?.ownerRoleId].filter(Boolean);
  return managerRoleIds.length
    ? managerRoleIds.some((roleId) => memberHasRole(interaction, roleId))
      || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    : isStaff(interaction);
}

async function handleGiveawayButton(interaction) {
  const [, action, giveawayId] = interaction.customId.split(':');
  if (action !== 'enter') {
    return interaction.reply({ content: 'This giveaway action is not valid.', ephemeral: true });
  }
  const giveaway = store.getGiveaway(interaction.guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') {
    return interaction.reply({ content: 'This giveaway has ended or is unavailable.', ephemeral: true });
  }
  if (store.isBannedFromGiveaways(interaction.guildId, interaction.user.id)) {
    return interaction.reply({ content: 'You are not allowed to enter giveaways in this server.', ephemeral: true });
  }
  if (giveaway.roleIds?.length
    && !giveaway.roleIds.some((roleId) => memberHasRole(interaction, roleId))) {
    return interaction.reply({ content: 'You do not have an eligible role to enter this giveaway.', ephemeral: true });
  }
  if (giveaway.messageCount
    && store.getMessageCount(interaction.guildId, giveaway.messageChannelId, interaction.user.id) < giveaway.messageCount) {
    return interaction.reply({
      content: `You need at least ${giveaway.messageCount} tracked messages in <#${giveaway.messageChannelId}> to enter.`,
      ephemeral: true,
    });
  }
  if (!store.addGiveawayEntrant(interaction.guildId, giveawayId, interaction.user.id)) {
    return interaction.reply({ content: 'You have already entered this giveaway.', ephemeral: true });
  }
  const updatedGiveaway = store.getGiveaway(interaction.guildId, giveawayId);
  await interaction.message.edit({
    components: [giveawayContainer(updatedGiveaway)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  return interaction.reply({ content: 'You entered the giveaway!', ephemeral: true });
}

async function restoreScheduledVoidChecks() {
  const state = store.read();
  for (const order of state.orders ?? []) {
    if (order.status === 'completed' && !order.voidedAt) {
      scheduleVoidCheckForOrder(order);
    }
  }
}

async function restoreScheduledOrderExpirations() {
  const initialState = store.read();
  for (const guildId of new Set((initialState.orders ?? []).map((order) => order.guildId))) {
    store.listActive(guildId);
  }
  const state = store.read();
  for (const order of state.orders ?? []) {
    if (['pending', 'claimed'].includes(order.status)) {
      scheduleOrderExpiration(order);
    } else if (order.status === 'expired') {
      try {
        await refreshOrderMessage(order);
      } catch (error) {
        console.error(`Could not refresh expired order ${order.id}:`, error);
      }
    }
  }
}

async function restoreScheduledGiveaways() {
  for (const giveaway of store.listActiveGiveaways()) {
    scheduleGiveawayEnd(giveaway);
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
  return sendV2(channel, {
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
    const response = {
      content: 'Ticket transcripts are not configured. Ask an administrator to run `/set ticket_transcript channel:#channel` before closing tickets.',
      ephemeral: true,
    };
    return interaction.deferred || interaction.replied
      ? interaction.editReply(response)
      : interaction.reply(response);
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
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
  await sendV2(transcriptChannel, {
    embeds: [transcriptEmbed],
    files: [transcriptFile],
    allowedMentions: { parse: [] },
  });
  let ownerNotified = true;
  try {
    const owner = await client.users.fetch(ownerId);
    await sendV2(owner, {
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
    const postedMessage = await sendV2(message.channel, {
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
    await sendV2(channel, {
      ...ticketManagerMentionPayload(settings),
      embeds: [ticketEmbed(type, interaction.user, orderForm, reportForm, othersForm)],
      components: [ticketButtons()],
    });
    if (type === 'order') {
      await sendV2(channel, {
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

  if (interaction.commandName === 'voidedchannel') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only server administrators can configure the voided channel.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choose a text channel in this server.', ephemeral: true });
    }
    store.setSettings(interaction.guildId, { voidedChannelId: channel.id });
    return interaction.reply({ content: `Voided-order alerts will be posted in ${channel}.`, ephemeral: true });
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
    const message = await sendV2(channel, {
      components: [orderContainer(order)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    store.setOrderMessage(order.id, channel.id, message.id);
    scheduleOrderExpiration(store.getOrder(order.id));
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
      components: [multiplicationContainer(result)],
      flags: MessageFlags.IsComponentsV2,
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

  if (interaction.commandName === 'payment') {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'Only authorized staff can send payment reminders.', ephemeral: true });
    }
    if (!ticketOwnerId(interaction.channel)) {
      return interaction.reply({ content: 'Run `/payment` inside an active ticket.', ephemeral: true });
    }
    await sendV2(interaction.channel, {
      embeds: [paymentReminderEmbed(interaction.guild?.iconURL())],
      components: [paymentReminderButtons()],
      allowedMentions: { parse: [] },
    });
    return interaction.reply({ content: 'Payment reminder sent in this ticket.', ephemeral: true });
  }

  if (interaction.commandName === 'giveaway') {
    if (!canManageGiveaways(interaction)) {
      return interaction.reply({ content: 'Only the configured `/setadmin` or `/setowner` roles can manage giveaways.', ephemeral: true });
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') {
      const durationText = interaction.options.getString('duration', true);
      const durationMs = parseGiveawayDuration(durationText);
      if (!durationMs) {
        return interaction.reply({ content: 'Enter a valid giveaway duration from 1 second to 365 days, such as `30m`, `12h`, or `7d`.', ephemeral: true });
      }
      const channel = interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        return interaction.reply({ content: 'Run `/giveaway start` in a sendable server text channel.', ephemeral: true });
      }
      const messageCount = interaction.options.getInteger('message_count');
      const requestedMessageChannel = interaction.options.getChannel('message_channel');
      const messageChannel = requestedMessageChannel ?? channel;
      if (messageCount && (!messageChannel.isTextBased() || messageChannel.guildId !== interaction.guildId)) {
        return interaction.reply({ content: 'Choose a tracked message channel in this server.', ephemeral: true });
      }
      const requirements = interaction.options.getString('messagerequirements')?.trim() || null;
      const roleText = interaction.options.getString('override_req_roles');
      let roleIds = [];
      if (roleText) {
        roleIds = [...new Set(roleText.match(/\d{17,20}/g) ?? [])];
        if (!roleIds.length || roleIds.length > 10) {
          return interaction.reply({ content: 'Enter 1 to 10 valid role mentions or IDs for the role requirement.', ephemeral: true });
        }
        const missingRoleIds = [];
        for (const roleId of roleIds) {
          if (!await interaction.guild.roles.fetch(roleId).catch(() => null)) missingRoleIds.push(roleId);
        }
        if (missingRoleIds.length) {
          return interaction.reply({ content: `These roles are not in this server: ${missingRoleIds.map((id) => `<@&${id}>`).join(', ')}.`, ephemeral: true });
        }
      }
      await interaction.deferReply({ ephemeral: true });
      const giveaway = store.createGiveaway({
        guildId: interaction.guildId,
        channelId: channel.id,
        prize: interaction.options.getString('prize', true).trim(),
        hostId: interaction.options.getUser('host', true).id,
        winnerCount: interaction.options.getInteger('winners', true),
        endsAt: new Date(Date.now() + durationMs).toISOString(),
        messageCount: messageCount ?? null,
        messageChannelId: messageCount ? messageChannel.id : null,
        requirements,
        roleIds,
      });
      try {
        const message = await sendV2(channel, {
          components: [giveawayContainer(giveaway)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        });
        store.setGiveawayMessage(giveaway.id, message.id);
        scheduleGiveawayEnd(giveaway);
      } catch (error) {
        store.deleteGiveaway(giveaway.id);
        throw error;
      }
      return interaction.editReply({ content: `Giveaway started in ${channel}.` });
    }

    if (subcommand === 'end' || subcommand === 'reroll') {
      const messageId = interaction.options.getString('message_id', true);
      const giveaway = store.findGiveawayByMessage(interaction.guildId, messageId);
      if (!giveaway) {
        return interaction.reply({ content: 'I could not find a giveaway with that message ID in this server.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      if (subcommand === 'end') {
        const ended = await finishGiveaway(interaction.guildId, giveaway.id);
        if (!ended) return interaction.editReply({ content: 'That giveaway has already ended.' });
        return interaction.editReply({ content: `Giveaway ended in <#${ended.channelId}>.` });
      }
      if (giveaway.status !== 'ended') {
        return interaction.editReply({ content: 'End the giveaway before rerolling its winners.' });
      }
      const previousWinners = [
        ...giveaway.winners,
        ...(giveaway.rerolls ?? []).flatMap((reroll) => reroll.winners),
      ];
      const winners = selectGiveawayWinners(giveaway.entrants, giveaway.winnerCount, previousWinners);
      const updated = store.addGiveawayReroll(interaction.guildId, giveaway.id, winners);
      const channel = await client.channels.fetch(updated.channelId);
      await sendV2(channel, {
        content: winners.length
          ? `🎉 New winner${winners.length === 1 ? '' : 's'} for **${updated.prize}**: ${winners.map((id) => `<@${id}>`).join(', ')}!`
          : `No eligible entrants remain to reroll **${updated.prize}**.`,
        allowedMentions: { users: winners },
      });
      return interaction.editReply({ content: 'Giveaway winners rerolled.' });
    }

    if (subcommand === 'ban') {
      const user = interaction.options.getUser('user', true);
      const added = store.banFromGiveaways(interaction.guildId, user.id, interaction.user.id);
      return interaction.reply({ content: added ? `${user} is now banned from giveaways.` : `${user} was already banned from giveaways.`, ephemeral: true });
    }
    if (subcommand === 'banned') {
      const bans = store.listGiveawayBans(interaction.guildId);
      const listing = bans.length
        ? bans.map(({ userId }) => `<@${userId}>`).join('\n')
        : 'No users are banned from giveaways.';
      return interaction.reply({ content: `**Giveaway bans (${bans.length})**\n${listing}`, ephemeral: true });
    }
    return interaction.reply({ content: 'This giveaway action is not supported.', ephemeral: true });
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
    await sendV2(channel, {
      content: text,
      allowedMentions: { parse: [] },
    });
    return interaction.reply({ content: `Message posted in ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'dmsuser') {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'You do not have permission to send messages as the bot.', ephemeral: true });
    }
    const user = interaction.options.getUser('user', true);
    const text = interaction.options.getString('reply', true);
    await interaction.deferReply({ ephemeral: true });
    await sendV2(user, { content: text, allowedMentions: { parse: [] } });
    return interaction.editReply({ content: `Message sent to ${user}.` });
  }

  if (['robuxform', 'openshop', 'closeshop'].includes(interaction.commandName)) {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'You do not have permission to post shop messages.', ephemeral: true });
    }
    const channel = interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return interaction.reply({ content: 'Run this command in a server text channel.', ephemeral: true });
    }
    const container = interaction.commandName === 'robuxform'
      ? robuxFormContainer()
      : interaction.commandName === 'openshop'
        ? openShopContainer()
        : closeShopContainer();
    await interaction.deferReply({ ephemeral: true });
    await sendV2(channel, {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return interaction.editReply({ content: `Posted the ${interaction.commandName === 'robuxform' ? 'Robux fill-up form' : `shop ${interaction.commandName === 'openshop' ? 'open' : 'closed'} announcement`}.` });
  }

  if (interaction.commandName === 'vouch') {
    const settings = store.getSettings(interaction.guildId);
    if (!settings?.vouchChannelId) {
      return interaction.reply({ content: 'The vouch channel has not been set. Ask an administrator to run `/set vouch channel:#channel`.', ephemeral: true });
    }
    const submittedItems = interaction.options.getString('items', true).trim();
    const feedback = interaction.options.getString('feedback', true).trim();
    const proofs = ['proof', 'proof2']
      .map((name) => interaction.options.getAttachment(name))
      .filter(Boolean);
    if (!submittedItems || !feedback) {
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
    const channel = await client.channels.fetch(settings.vouchChannelId);
    if (!channel
      || channel.guildId !== interaction.guildId
      || !channel.isTextBased()
      || typeof channel.send !== 'function') {
      throw new Error(`Vouch channel ${settings.vouchChannelId} is unavailable or not a sendable server text channel.`);
    }
    let proofCollage = null;
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
    const quantity = await ticketQuantity(interaction.channel);
    const items = quantity === null ? submittedItems : `${submittedItems} (x${quantity})`;
    const vouchedAt = new Date();
    const embed = vouchEmbed(interaction.user, items, feedback, vouchedAt);
    embed.setImage('attachment://vouch-proofs.png');
    const previewId = randomUUID();
    const timeoutId = setTimeout(() => discardVouchPreview(previewId), VOUCH_PREVIEW_DURATION_MS);
    timeoutId.unref();
    pendingVouchPreviews.set(previewId, {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: channel.id,
      ticketChannelId: ticketOwnerId(interaction.channel) === interaction.user.id
        ? interaction.channel.id
        : null,
      items,
      vouchedAt,
      ticketOwnerDmId: ticketOwnerId(interaction.channel) === interaction.user.id
        ? interaction.user.id
        : null,
      embed,
      proofCollage,
      timeoutId,
    });
    return interaction.editReply({
      content: 'Preview your vouch below. Confirm to post it, or choose “No, I’ll change it” and run `/vouch` again.',
      embeds: [embed],
      components: [vouchPreviewButtons(previewId)],
      files: [{ attachment: proofCollage, name: 'vouch-proofs.png' }],
      allowedMentions: { parse: [] },
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
      const postedMessage = await sendV2(channel, { content, allowedMentions: { parse: [] } });
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
  return interaction.reply({
    content: `The /${interaction.commandName} command is not implemented. Please contact an administrator.`,
    ephemeral: true,
  });
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
    const settings = store.getSettings(interaction.guildId);
    const ticketRoleIds = ticketAccessRoleIds(settings);
    const managerRoleIds = ticketManagerRoleIds(settings);
    if (!managerRoleIds.some((roleId) => memberHasRole(interaction, roleId))) {
      return interaction.reply({ content: 'Only members with the configured `/setadmin` or `/setowner` role can claim tickets.', ephemeral: true });
    }
    if (ticketTermsRequired(channel) && !ticketTermsAccepted(channel)) {
      return interaction.reply({ content: 'The ticket owner must accept the terms before this ticket can be claimed.', ephemeral: true });
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
  const completionReminderEmbed = action === 'complete' ? orderCompletionReminderEmbed() : null;
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
      await sendV2(sourceChannel, {
        embeds: [statusEmbed],
        allowedMentions: { parse: [] },
      });
      if (completionReminderEmbed) {
        await sendV2(sourceChannel, {
          embeds: [completionReminderEmbed],
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      console.error(`Could not send status update for order ${order.id} to source channel ${order.sourceChannelId}:`, error);
      notificationFailures.push(`the original order channel <#${order.sourceChannelId}>`);
    }
  }
  try {
    const customer = await client.users.fetch(order.customerId);
    await sendV2(customer, { embeds: [statusEmbed], allowedMentions: { parse: [] } });
    if (completionReminderEmbed) {
      const vouchChannelId = store.getSettings(order.guildId)?.vouchChannelId;
      await sendV2(customer, {
        embeds: [completionReminderEmbed],
        components: [vouchLinkButton(order.guildId, vouchChannelId)],
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
  await restoreScheduledOrderExpirations();
  await restoreScheduledGiveaways();
});

client.on('interactionCreate', async (interaction) => {
  wrapInteractionResponses(interaction);
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('vouch-preview:')) await handleVouchPreviewButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('giveaway:')) await handleGiveawayButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('ticket-close:')) await handleTicketCloseConfirmation(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('ticket:')) await handleTicketButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('order:')) await handleButton(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('payment:')) await handlePaymentButton(interaction);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-close-reason:')) {
      await handleTicketCloseReasonModal(interaction);
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
  wrapMessageResponses(message);
  const messageCommand = !message.author.bot && message.guild
    ? parseTicketMessageCommand(message.content)
    : null;
  try {
    if (message.guild && !message.author.bot) {
      store.incrementMessageCount(message.guild.id, message.channel.id, message.author.id);
    }
    if (messageCommand?.name === 'help') {
      await sendV2(message.channel, {
        embeds: [helpEmbed(commands)],
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (messageCommand?.name === 'payment') {
      const ownerId = ticketOwnerId(message.channel);
      if (!ownerId) {
        await message.reply('`,payment` can only be used inside an active ticket.');
        return;
      }
      if (ownerId !== message.author.id) {
        await message.reply('Only the ticket creator can use `,payment` in this ticket.');
        return;
      }
      await sendV2(message.channel, {
        embeds: [paymentReminderEmbed(message.guild.iconURL())],
        components: [paymentReminderButtons()],
        allowedMentions: { parse: [] },
      });
      return;
    }
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
          components: [multiplicationContainer(result)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        },
      );
      if (deleteError) {
        console.error(`Could not delete calc command message ${message.id}:`, deleteError);
        await sendV2(message.channel, 'I solved the calculation, but could not delete your command. Please check that I have the Manage Messages permission.');
      }
      return;
    }
    if (messageCommand?.name === 'ticketsetup') {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('Only server administrators can post the ticket panel.');
      } else {
        await postTicketPanel(message.channel);
      }
      return;
    }
    if (messageCommand?.name === 'set_voided') {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('Only server administrators can configure the voided channel.');
        return;
      }
      if (messageCommand.args.length !== 1) {
        await message.reply('Usage: `,setvoided <channel id>`');
        return;
      }
      let channel;
      try {
        channel = await fetchGuildChannelById(message.guild, messageCommand.args[0]);
      } catch (error) {
        await message.reply(error.message);
        return;
      }
      if (!channel.isTextBased() || typeof channel.send !== 'function') {
        await message.reply('That ID is not a sendable text channel in this server.');
        return;
      }
      store.setSettings(message.guild.id, { voidedChannelId: channel.id });
      await message.reply(`Voided-order alerts will be posted in ${channel}.`);
      return;
    }
    if (messageCommand?.name === 'setorder') {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('Only server administrators can set the order channel.');
        return;
      }
      if (messageCommand.args.length !== 1) {
        await message.reply('Usage: `,setorder <channel_id>`');
        return;
      }
      let channel;
      try {
        channel = await fetchGuildChannelById(message.guild, messageCommand.args[0]);
      } catch (error) {
        await message.reply(error.message);
        return;
      }
      if (!channel.isTextBased() || typeof channel.send !== 'function') {
        await message.reply('That ID is not a sendable text channel in this server.');
        return;
      }
      store.setSettings(message.guild.id, { orderChannelId: channel.id });
      await message.reply(`New orders will be posted in ${channel}.`);
      return;
    }
    if (messageCommand?.name === 'set_role_voided') {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('Only server administrators can configure the voided role.');
        return;
      }
      if (messageCommand.args.length !== 1) {
        await message.reply('Usage: `,setvoidedrole <role_id>`');
        return;
      }
      const role = message.guild.roles.cache.get(messageCommand.args[0]) ?? await message.guild.roles.fetch(messageCommand.args[0]).catch(() => null);
      if (!role) {
        await message.reply('That ID is not a role in this server.');
        return;
      }
      store.setSettings(message.guild.id, { voidedRoleId: role.id });
      await message.reply(`${role} will be granted to members marked as voided.`);
      return;
    }
    const ticketCategoryShortcuts = {
      ordercategory: ['ticketOrderCategoryId', 'order'],
      reportcategory: ['ticketReportCategoryId', 'report'],
      othercategory: ['ticketOthersCategoryId', 'other'],
    };
    if (messageCommand?.name === 'setupticketcategory'
      || messageCommand?.name === 'set_ticket_transcript'
      || ticketCategoryShortcuts[messageCommand?.name]) {
      if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('Only server administrators can configure ticket channels.');
        return;
      }
      if (messageCommand.args.length !== 1) {
        const shortcutLabels = {
          ordercategory: 'ordercategory',
          reportcategory: 'reportcategory',
          othercategory: 'othercategory',
        };
        const usage = ticketCategoryShortcuts[messageCommand.name]
          ? `Usage: \`,${shortcutLabels[messageCommand.name]} <category_id>\``
          : messageCommand.name === 'setupticketcategory'
            ? 'Usage: `,setupticketcategory <category id>`'
            : 'Usage: `,set ticket_transcript <channel id>`';
        await message.reply(usage);
        return;
      }

      let channel;
      try {
        channel = await fetchGuildChannelById(message.guild, messageCommand.args[0]);
      } catch (error) {
        await message.reply(error.message);
        return;
      }
      if (messageCommand.name === 'setupticketcategory') {
        if (channel.type !== ChannelType.GuildCategory) {
          await message.reply('That ID is not a category in this server.');
          return;
        }
        store.setSettings(message.guild.id, { ticketCategoryId: channel.id });
        await message.reply(`New ticket channels will be created in **${channel.name}**.`);
      } else if (ticketCategoryShortcuts[messageCommand.name]) {
        if (channel.type !== ChannelType.GuildCategory) {
          await message.reply('That ID is not a category in this server.');
          return;
        }
        const [settingKey, label] = ticketCategoryShortcuts[messageCommand.name];
        store.setSettings(message.guild.id, { [settingKey]: channel.id });
        await message.reply(`New ${label} tickets will be created in **${channel.name}**.`);
      } else {
        if (!channel.isTextBased() || typeof channel.send !== 'function') {
          await message.reply('That ID is not a sendable text channel in this server.');
          return;
        }
        store.setSettings(message.guild.id, { ticketTranscriptChannelId: channel.id });
        await message.reply(`Closed ticket transcripts will be posted in ${channel}.`);
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