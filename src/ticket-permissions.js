const { PermissionFlagsBits } = require('discord.js');

function ticketAccessRoleIds(settings) {
  return [...new Set([
    settings?.ticketStaffRoleId,
    settings?.adminRoleId,
    settings?.ownerRoleId,
  ].filter(Boolean))];
}

function ticketManagerRoleIds(settings) {
  return [...new Set([settings?.adminRoleId, settings?.ownerRoleId].filter(Boolean))];
}

function hasTicketManagerRole(settings, memberHasRole) {
  return ticketManagerRoleIds(settings).some(memberHasRole);
}

function hasVoidedRole(settings, memberHasRole) {
  return Boolean(settings?.voidedRoleId && memberHasRole(settings.voidedRoleId));
}

function ticketManagerMentionPayload(settings) {
  const roleIds = ticketManagerRoleIds(settings);
  return {
    ...(roleIds.length ? { content: roleIds.map((roleId) => `<@&${roleId}>`).join(' ') } : {}),
    allowedMentions: { roles: roleIds },
  };
}

function ticketOwnerPermissionOverwrite(userId, type) {
  const overwrite = {
    id: userId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ],
  };
  if (type === 'order') {
    overwrite.deny = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads];
  } else {
    overwrite.allow.push(PermissionFlagsBits.SendMessages);
  }
  return overwrite;
}

function ticketAccessRolePermissionOverwrite(roleId, type) {
  const overwrite = {
    id: roleId,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
  };
  if (type === 'order') {
    overwrite.deny = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads];
  } else {
    overwrite.allow.push(PermissionFlagsBits.SendMessages);
  }
  return overwrite;
}

module.exports = {
  ticketAccessRoleIds,
  ticketManagerRoleIds,
  hasTicketManagerRole,
  hasVoidedRole,
  ticketManagerMentionPayload,
  ticketOwnerPermissionOverwrite,
  ticketAccessRolePermissionOverwrite,
};
