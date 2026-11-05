const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/** "250", "19.9" or "19.99" to US cents, exactly: no floating point on the way. Null for anything else. */
export function centsOf(amountUsd: string): number | null {
  const match = AMOUNT.exec(amountUsd.trim());
  if (match === null) return null;
  const [, dollars = '0', fraction = ''] = match;
  return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
}

export function usdOf(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
