import { createHash } from 'node:crypto';

/**
 * The same amount and reference on the same store give the same key, so a model that repeats a call gets the invoice it
 * already made (spec SPEC-mcp-server 3.3). Hashed: a reference may hold anything, the API takes printable ASCII only.
 */
export function idempotencyKeyOf(storeId: string, amountUsdCents: number, reference: string): string {
  return `mcp-${createHash('sha256').update(JSON.stringify([storeId, amountUsdCents, reference])).digest('hex')}`;
}
