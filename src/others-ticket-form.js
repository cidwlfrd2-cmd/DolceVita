const VALID_REQUEST_TYPES = new Set(['PARTNERSHIP', 'CONCERN']);

function parseOthersTicketForm(input) {
  const type = input?.type?.trim().toUpperCase();
  if (!VALID_REQUEST_TYPES.has(type)) {
    return { error: 'Please enter exactly PARTNERSHIP or CONCERN.' };
  }
  return { value: { type } };
}

module.exports = { parseOthersTicketForm };
