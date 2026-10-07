const PRODUCTS = new Set(['DEKOR', 'GAMECREDITS', 'SVBOOST', 'ROBUX']);

function parseOrderVouchForm(form) {
  const product = form.product.trim().toUpperCase();
  const quantity = form.quantity.trim();
  const feedback = form.feedback.trim();

  if (!PRODUCTS.has(product)) {
    return { error: 'PRODUCT must be DEKOR, GAMECREDITS, SVBOOST, or ROBUX.' };
  }
  if (!/^\d{1,4}$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 1000) {
    return { error: 'QUANTITY must be a whole number from 1 to 1000.' };
  }
  if (!feedback) {
    return { error: 'FEEDBACK cannot be blank.' };
  }

  return {
    value: {
      product,
      quantity: String(Number(quantity)),
      feedback,
    },
  };
}

module.exports = { parseOrderVouchForm };
