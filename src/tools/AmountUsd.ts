const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/** "250", "19.9" or "19.99" to US cents, exactly: no floating point on the way. Null for anything else. */
export function centsOf(amountUsd: string): number | null {
  const match = AMOUNT.exec(amountUsd.trim());
  if (match === null) return null;
  const [, dollars = '0', fraction = ''] = match;
  return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Millionths of a dollar ("431200000") to dollars ("431.20"), exactly: at least two decimals, more only when they are not zero. */
export function usdOfMicros(micros: string | bigint): string {
  const value = BigInt(micros);
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${value / 1_000_000n}.${fraction}`;
}

export function usdOf(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
