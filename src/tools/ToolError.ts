import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, AuthenticationError, RateLimitedError, StablevoyError } from 'stablevoy';
import { NotSignedInError } from '../stores/NotSignedInError.js';
import { StoreChoiceError } from '../stores/StoreChoiceError.js';

/** What the model should do about an API error code (spec SPEC-mcp-server 3.4), from the error catalog. */
const HINTS: Readonly<Record<string, string>> = {
  payout_address_not_set: 'The merchant must set a payout address in the Stablevoy dashboard. Do not retry.',
  payout_address_unacknowledged: 'The merchant must review and confirm the payout address in the Stablevoy dashboard. Do not retry.',
  networks_unavailable: 'No network can take payments right now. Try again in a few minutes.',
  amount_below_minimum: 'The amount is below the minimum invoice; call get_store for the limits.',
  amount_above_store_limit: 'The amount is above the store maximum; call get_store for the limits.',
  amount_above_platform_cap: 'The amount is above the platform maximum; call get_store for the limits.',
  store_disabled: 'The store is disabled in the Stablevoy dashboard. Do not retry.',
  invoice_not_cancellable: 'A payment has already been seen, or the invoice is no longer waiting for one; call get_invoice for its status. Do not retry.',
  invalid_invoice_lifetime: 'expiresInMinutes must be from 15 to 10080; leave it out for the store default.',
  open_invoice_limit_reached: 'The store has as many unpaid invoices as it may have open at once. Cancel the ones no longer needed with cancel_invoice (list_invoices with status awaiting_payment finds them) or let them expire, then try again.',
  invalid_invoice_filter: 'Check the filters: status and source from the tool description, days as YYYY-MM-DD with createdFrom not after createdTo. summarize_payments covers at most 92 days per call; split a year into four quarters.',
  conflict: 'The same amount and reference were used before with other parameters, or the invoice changed at the same moment; call get_invoice or list_invoices to see it, or use another reference.',
};

/**
 * Every failure becomes a tool error with its code and a hint, never an empty result (no silent fallback). The text
 * never holds a key: the SDK errors carry the API's detail only.
 */
export function toolError(error: unknown, storeLabel: string | null = null): CallToolResult {
  const where = storeLabel === null ? '' : ` (store ${storeLabel})`;
  return { content: [{ type: 'text', text: `${errorText(error)}${where}` }], isError: true };
}

/** The code and hint of a Stablevoy failure; anything else is a bug and is thrown on. */
export function errorText(error: unknown): string {
  if (error instanceof StoreChoiceError || error instanceof NotSignedInError) return error.message;
  if (error instanceof AuthenticationError) return `authentication_failed: the API key was refused, probably revoked in the dashboard. Run npx stablevoy-mcp login again. ${error.detail}`;
  if (error instanceof RateLimitedError) return `rate_limited: ${error.detail} Retry after ${error.retryAfterSeconds ?? 60} seconds.`;
  if (error instanceof ApiError) return `${error.code}: ${error.detail}${HINTS[error.code] === undefined ? '' : ` ${HINTS[error.code]}`}`;
  if (error instanceof StablevoyError) return `${error.name}: ${error.message}`;
  throw error;
}
