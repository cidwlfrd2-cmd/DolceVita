const PRODUCTS = new Set(['DEKOR', 'GAMECREDITS', 'ROBUX']);
const PAYMENT_METHODS = new Set(['GCASH', 'BANKTRANS', 'PAYMAYA']);

function parseOrderTicketForm(form) {
  const product = form.product.trim().toUpperCase();
  const quantity = form.quantity.trim();
  const paymentMethod = form.paymentMethod.trim().toUpperCase();

  if (!PRODUCTS.has(product)) {
    return { error: 'PRODUCT must be DEKOR, GAMECREDITS, or ROBUX.' };
  }
  if (!/^\d{1,4}$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 1000) {
    return { error: 'QUANTITY must be a whole number from 1 to 1000.' };
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return { error: 'PAYMENT METHOD must be GCASH, BANKTRANS, or PAYMAYA.' };
  }

  return {
    value: {
      product,
      quantity: String(Number(quantity)),
      paymentMethod,
    },
  };
}

module.exports = { parseOrderTicketForm };
