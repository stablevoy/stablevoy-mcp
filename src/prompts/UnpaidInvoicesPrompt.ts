import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { Prompt } from './Prompt.js';
import { argText, READ_ONLY_RULE, storeClause, storePromptArgument, userMessage } from './PromptText.js';

/** Unpaid invoices by expiry, the ones expiring within a day first, with the payment link to send the buyer again. */
export class UnpaidInvoicesPrompt implements Prompt {
  readonly name = 'unpaid_invoices';
  readonly title = 'Unpaid invoices to follow up';
  readonly description = 'Lists the invoices still waiting for payment, the ones expiring within 24 hours first, with the link to send the buyer. Needs a store key.';
  readonly args = { store: storePromptArgument };

  render(args: Readonly<Record<string, unknown>>): GetPromptResult {
    const store = storeClause(argText(args, 'store'));
    return userMessage(
      this.description,
      [
        'Find the Stablevoy invoices that are still waiting for payment.',
        `1. Call list_invoices with status "awaiting_payment" and limit 100${store}. While nextCursor is set, call it again with that cursor and the same store, at most 5 calls in all; say if more are left.`,
        '2. Sort them by expiresAt.',
        '3. List first the ones that expire within the next 24 hours, then the rest, each with amountUsd, reference, expiresAt and checkoutUrl.',
        '4. Remind me that Stablevoy does not email buyers: I send the checkoutUrl to the buyer myself.',
        READ_ONLY_RULE,
      ].join('\n'),
    );
  }
}
