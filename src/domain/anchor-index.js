export function bareDigit(n, count) {
  if (!Number.isInteger(n) || n < 1 || n > 9 || n > count) return null;
  return n;
}

export function ctrlNumber(n, count) {
  if (!Number.isInteger(n) || n < 1 || n > count) return null;
  return n;
}
