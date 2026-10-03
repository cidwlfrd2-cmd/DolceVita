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

function ticketManagerMentionPayload(settings) {
  const roleIds = ticketManagerRoleIds(settings);
  return {
    ...(roleIds.length ? { content: roleIds.map((roleId) => `<@&${roleId}>`).join(' ') } : {}),
    allowedMentions: { roles: roleIds },
  };
}

module.exports = {
  ticketAccessRoleIds,
  ticketManagerRoleIds,
  hasTicketManagerRole,
  ticketManagerMentionPayload,
};
