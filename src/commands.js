const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all bot commands.'),
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
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('ticket_transcript')
      .setDescription('Choose where closed ticket transcripts are posted.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel for closed ticket transcripts')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('voided')
      .setDescription('Choose where voided-order alerts are posted.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel for voided-order alerts')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('voided_role')
      .setDescription('Choose the role granted when an order is marked voided.')
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Role granted to users marked as voided')
        .setRequired(true))),
  new SlashCommandBuilder()
    .setName('setowner')
    .setDescription('Choose the role allowed to manage order buttons.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role allowed to process, complete, and cancel orders')
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('setadmin')
    .setDescription('Choose the role allowed to use order commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role allowed to submit and claim orders')
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('setorder')
    .setDescription('Choose where order embeds are posted.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel where new orders will be sent')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
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
      .setMaxValue(999)),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Display the public order queue.'),
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim the next waiting order.'),
  new SlashCommandBuilder()
    .setName('solving')
    .setDescription('Multiply two numbers.')
    .addNumberOption((option) => option
      .setName('amount_one')
      .setDescription('First amount')
      .setRequired(true))
    .addNumberOption((option) => option
      .setName('amount_two')
      .setDescription('Second amount')
      .setRequired(true)),
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
      .setDescription('First proof image')
      .setRequired(true))
    .addAttachmentOption((option) => option
      .setName('proof2')
      .setDescription('Second proof image')),
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
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Set up the server ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('setup')
      .setDescription('Post the ticket panel in this channel.')
      .addRoleOption((option) => option
        .setName('staff_role')
        .setDescription('Optional role that can view tickets; /setadmin or /setowner roles manage them'))),
  new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Post the ticket panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setupticketcategory')
    .setDescription('Choose the category for new ticket channels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
      .setName('category_id')
      .setDescription('ID of the category where new tickets will be created')
      .setRequired(true)
      .setMaxLength(20)),
].map((command) => command.toJSON());