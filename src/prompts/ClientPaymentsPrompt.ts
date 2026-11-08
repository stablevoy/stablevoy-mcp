import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Prompt } from './Prompt.js';
import { argText, READ_ONLY_RULE, storeClause, storePromptArgument, userMessage } from './PromptText.js';

/** Every invoice of one order or client by its reference, with what was paid and the transactions. */
export class ClientPaymentsPrompt implements Prompt {
  readonly name = 'client_payments';
  readonly title = 'Payments of one order or client';
  readonly description = 'Finds every invoice whose reference starts with the given order number or client reference and shows what was paid. Needs a store key.';
  readonly args = { reference: z.string().min(1).max(200).describe('The order number or client reference, or its start.'), store: storePromptArgument };

  render(args: Readonly<Record<string, unknown>>): GetPromptResult {
    const store = storeClause(argText(args, 'store'));
    const reference = JSON.stringify(argText(args, 'reference'));
    return userMessage(
      this.description,
      [
        `Find every Stablevoy invoice whose reference starts with ${reference}.`,
        `1. Call list_invoices with search ${reference}${store}. While nextCursor is set, call it again with that cursor and the same store, at most 5 calls in all.`,
        '2. Call get_invoice for each invoice found, with its store.',
        '3. Report each invoice: status, amountUsd, the amount received, network and token, every payment with its txHash and explorer link, createdAt and paidAt. Say plainly when nothing was found.',
        READ_ONLY_RULE,
      ].join('\n'),
    );
  }
}
