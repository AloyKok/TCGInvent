export function formatMoney(value: number, symbol = 'S$') {
  const amount = Number.isFinite(value) ? value : 0;
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}
