function slug(value, maxLength) {
  return value.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

function ticketChannelName(type, username, product) {
  const usernameSlug = slug(username, 32) || 'customer';
  const productSlug = type === 'others'
    ? 'partnership-concern'
    : product ? slug(product, 50) : '';
  return [type, productSlug, usernameSlug].filter(Boolean).join('-').slice(0, 100).replace(/-+$/g, '');
}

module.exports = { ticketChannelName };
