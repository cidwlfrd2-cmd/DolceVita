const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Choose the channel for public order posts.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Text channel where new orders will be posted')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption((option) => option
      .setName('staff_role')
      .setDescription('Optional role allowed to claim, complete, and cancel orders')),
  new SlashCommandBuilder()
    .setName('set')
    .setDescription('Configure bot channels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('vouch')
      .setDescription('Choose where vouches are posted.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel for public vouch embeds')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
  new SlashCommandBuilder()
    .setName('setowner')
    .setDescription('Choose the role allowed to manage order buttons.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role allowed to process, complete, and cancel orders')
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('order')
    .setDescription('Submit an order to the public queue.')
    .addStringOption((option) => option
      .setName('items')
      .setDescription('What items would you like to buy?')
      .setRequired(true)
      .setMaxLength(1024))
    .addStringOption((option) => option
      .setName('payment_method')
      .setDescription('How will you pay?')
      .setRequired(true)
      .setMaxLength(100))
    .addUserOption((option) => option
      .setName('supporter')
      .setDescription('Staff member supporting this order')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('quantity')
      .setDescription('How many?')
      .setMinValue(1)
      .setMaxValue(999))
    .addStringOption((option) => option
      .setName('details')
      .setDescription('Options or notes for staff')
      .setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Display the public order queue.'),
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim the next waiting order.'),
  new SlashCommandBuilder()
    .setName('message')
    .setDescription('Post a message as the bot.')
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Message to post')
      .setRequired(true)
      .setMaxLength(2000))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel to post in; defaults to this channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Leave a public vouch.')
    .addStringOption((option) => option
      .setName('items')
      .setDescription('Items being vouched for')
      .setRequired(true)
      .setMaxLength(1024))
    .addStringOption((option) => option
      .setName('feedback')
      .setDescription('Your feedback')
      .setRequired(true)
      .setMaxLength(1024))
    .addAttachmentOption((option) => option
      .setName('proof')
      .setDescription('First proof image'))
    .addAttachmentOption((option) => option
      .setName('proof2')
      .setDescription('Second proof image'))
    .addAttachmentOption((option) => option
      .setName('proof3')
      .setDescription('Third proof image'))
    .addAttachmentOption((option) => option
      .setName('proof4')
      .setDescription('Fourth proof image'))
    .addAttachmentOption((option) => option
      .setName('proof5')
      .setDescription('Fifth proof image')),
  new SlashCommandBuilder()
    .setName('checkvouch')
    .setDescription('Check a user vouch history.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('User to check; defaults to you')),
  new SlashCommandBuilder()
    .setName('stickymessage')
    .setDescription('Configure a channel sticky message.')
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('Set the sticky message for a channel.')
      .addStringOption((option) => option
        .setName('text')
        .setDescription('Message to keep at the bottom of the channel')
        .setRequired(true)
        .setMaxLength(2000))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel to set; defaults to this channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Remove the sticky message from a channel.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel to clear; defaults to this channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
].map((command) => command.toJSON());