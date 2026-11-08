import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { Prompt } from './Prompt.js';
import { argText, READ_ONLY_RULE, storeClause, storePromptArgument, userMessage } from './PromptText.js';

/** For each transfer that matched no invoice, the invoice it most likely belongs to, as a suggestion for the merchant. */
export class ReviewUnmatchedTransfersPrompt implements Prompt {
  readonly name = 'review_unmatched_transfers';
  readonly title = 'Review unmatched transfers';
  readonly description = 'Suggests, for each transfer that matched no invoice, the invoice it most likely belongs to; the merchant assigns it in the dashboard. Needs a store key.';
  readonly args = { store: storePromptArgument };

  render(args: Readonly<Record<string, unknown>>): GetPromptResult {
    const store = storeClause(argText(args, 'store'));
    return userMessage(
      this.description,
      [
        'Review the Stablevoy transfers that matched no invoice.',
        `1. Call list_unmatched_transfers${store}.`,
        `2. For each transfer, call list_invoices${store} with createdFrom the UTC day before its detectedAt and createdTo the day of it, and look at the invoices with status awaiting_payment, expired or underpaid.`,
        '3. For each transfer suggest the invoice it most likely belongs to: created before the transfer, with the amount closest to it and not below it, since exchanges take their fee out of the amount. Say how sure you are and why, or that no invoice fits.',
        '4. These are suggestions only: the tools cannot assign a transfer. Tell me to assign it in the Stablevoy dashboard, Unmatched transfers section.',
        READ_ONLY_RULE,
      ].join('\n'),
    );
  }
}
