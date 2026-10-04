const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !NUMBER_PATTERN.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function multiplyAmounts(first, second) {
  const amountOne = parseAmount(first);
  const amountTwo = parseAmount(second);
  if (amountOne === null || amountTwo === null) return null;

  const product = amountOne * amountTwo;
  if (!Number.isFinite(product)) return null;
  return { amountOne, amountTwo, product };
}

function multiplyExpression(expression) {
  if (typeof expression !== 'string') return null;
  const amounts = expression.split('*');
  if (amounts.length !== 2) return null;
  return multiplyAmounts(amounts[0].trim(), amounts[1].trim());
}

module.exports = { multiplyAmounts, multiplyExpression };
