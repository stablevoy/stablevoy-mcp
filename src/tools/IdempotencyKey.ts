import { createHash } from 'node:crypto';

/**
 * The same amount and reference on the same store give the same key, so a model that repeats a call gets the invoice it
 * already made (spec SPEC-mcp-server 3.3). Hashed: a reference may hold anything, the API takes printable ASCII only.
 * amount is US cents for a dollar price (the key of every earlier version), or "4999 EUR" for a price in another currency.
 */
export function idempotencyKeyOf(storeId: string, amount: number | string, reference: string): string {
  return `mcp-${createHash('sha256').update(JSON.stringify([storeId, amount, reference])).digest('hex')}`;
}
