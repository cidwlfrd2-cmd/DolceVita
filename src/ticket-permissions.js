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

module.exports = { ticketAccessRoleIds, ticketManagerRoleIds };
