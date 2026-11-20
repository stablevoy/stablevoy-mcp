/** "250", "19.9" or "19.99" to US cents, exactly: no floating point on the way. Null for anything else. */
export function centsOf(amountUsd: string): number | null {
  return minorUnitsOf(amountUsd, 2);
}

/** "49.99" with exponent 2 to 4999, "1500" with exponent 0 to 1500, exactly. Null for anything else, more decimals included. */
export function minorUnitsOf(amount: string, exponent: number): number | null {
  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(amount.trim());
  if (match === null) return null;
  const [, whole = '0', fraction = ''] = match;
  if (fraction.length > exponent) return null;
  return Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
}

/** 4999 with exponent 2 to "49.99", 1500 with exponent 0 to "1500". */
export function decimalOf(minorUnits: number, exponent: number): string {
  if (exponent === 0) return String(minorUnits);
  const scale = 10 ** exponent;
  return `${Math.trunc(minorUnits / scale)}.${String(minorUnits % scale).padStart(exponent, '0')}`;
}

/** Millionths of a dollar ("431200000") to dollars ("431.20"), exactly: at least two decimals, more only when they are not zero. */
export function usdOfMicros(micros: string | bigint): string {
  const value = BigInt(micros);
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${value / 1_000_000n}.${fraction}`;
}

export function usdOf(cents: number): string {
  return decimalOf(cents, 2);
}
