require('dotenv').config();

const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require('discord.js');
const { OrderStore } = require('./store');
const { orderButtons, orderEmbed, queueEmbed } = require('./embeds');
const { createProofCollage } = require('./vouch-proofs');
const commands = require('./commands');

const store = new OrderStore();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const stickyRefreshes = new Map();

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
    embeds: [orderEmbed(order)],
    components: [orderButtons(order)],
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

async function handleCommand(interaction) {
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
    const order = store.addOrder({
      guildId: interaction.guildId,
      customerId: interaction.user.id,
      sourceChannelId: interaction.channelId,
      items: interaction.options.getString('items', true),
      paymentMethod: interaction.options.getString('payment_method', true),
      supporterId: interaction.options.getUser('supporter', true).id,
      quantity: interaction.options.getInteger('quantity') ?? 1,
    });
    const channel = await client.channels.fetch(orderChannelId);
    const message = await channel.send({
      embeds: [orderEmbed(order)],
      components: [orderButtons(order)],
      allowedMentions: { parse: [] },
    });
    store.setOrderMessage(order.id, channel.id, message.id);
    return interaction.editReply(`Order #${order.id} was added to ${channel}.`);
  }

  if (interaction.commandName === 'queue') {
    return interaction.reply({
      embeds: [queueEmbed(store.listActive(interaction.guildId))],
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
    return interaction.reply({ content: `You claimed order #${order.id}: **${order.items ?? order.item}** × ${order.quantity}.`, ephemeral: true });
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
    const proofs = ['proof', 'proof2', 'proof3', 'proof4', 'proof5']
      .map((name) => interaction.options.getAttachment(name))
      .filter(Boolean);
    if (!items || !feedback) {
      return interaction.reply({ content: 'Items and feedback cannot be blank.', ephemeral: true });
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
    let proofCollage = null;
    if (proofs.length) {
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
    }
    const embed = new EmbedBuilder()
      .setColor(0x35a16b)
      .setTitle('Customer Vouch')
      .setDescription(`<@${interaction.user.id}> vouched for Dolce Vita, tysm! buy again!`)
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: 'Items', value: items },
        { name: 'Feedback', value: feedback },
      )
      .setTimestamp();
    if (proofCollage) embed.setImage('attachment://vouch-proofs.png');
    await channel.send({
      embeds: [embed],
      ...(proofCollage ? { files: [{ attachment: proofCollage, name: 'vouch-proofs.png' }] } : {}),
      allowedMentions: { parse: [] },
    });
    store.addVouch({ guildId: interaction.guildId, userId: interaction.user.id, items });
    return interaction.editReply(`Your vouch was posted in ${channel}.`);
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
        timeZone: 'UTC',
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
    embeds: [orderEmbed(order)],
    components: [orderButtons(order)],
    allowedMentions: { parse: [] },
  });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('order:')) await handleButton(interaction);
  } catch (error) {
    console.error('Interaction failed:', error);
    const response = { content: 'Something went wrong while handling that request. Please try again.', ephemeral: true };
    if (interaction.deferred) await interaction.editReply(response);
    else if (interaction.isRepliable() && !interaction.replied) await interaction.reply(response);
  }
});

client.on('messageCreate', refreshStickyMessage);

if (!process.env.DISCORD_TOKEN) throw new Error('Set DISCORD_TOKEN in your .env file.');
client.login(process.env.DISCORD_TOKEN);