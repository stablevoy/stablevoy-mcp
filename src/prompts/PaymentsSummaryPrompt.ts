import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { SummaryPeriod, type SummaryPeriodName } from 'stablevoy';
import { z } from 'zod';
import type { Prompt } from './Prompt.js';
import { argText, READ_ONLY_RULE, storeClause, storePromptArgument, userMessage } from './PromptText.js';

const PERIODS = Object.values(SummaryPeriod) as [SummaryPeriodName, ...SummaryPeriodName[]];

/** Paid and unpaid invoices of a period, per store and in total, against the period just before it. */
export class PaymentsSummaryPrompt implements Prompt {
  readonly name = 'payments_summary';
  readonly title = 'Payments summary';
  readonly description = 'Sums up the invoices of a period per store and in total, and compares it with the period before. Needs a store key.';
  readonly args = { period: z.enum(PERIODS).describe(`One of ${PERIODS.join(', ')}.`), store: storePromptArgument };

  render(args: Readonly<Record<string, unknown>>): GetPromptResult {
    const store = storeClause(argText(args, 'store'));
    return userMessage(
      this.description,
      [
        `Report the Stablevoy payments of ${argText(args, 'period')}.`,
        `1. Call summarize_payments with period ${JSON.stringify(argText(args, 'period'))}${store}. With several stores and no store given it returns one summary per store and a total.`,
        `2. Call summarize_payments again${store} with createdFrom and createdTo for the period of the same length that ends the day before this one starts, worked out from the days in the first answer.`,
        '3. Report per store and in total: invoices paid and receivedUsd, invoicedUsd, the money per network and token, how many are still awaiting payment and how many expired, and the change against the previous period in percent. Give dollar amounts exactly as the tools return them.',
        READ_ONLY_RULE,
      ].join('\n'),
    );
  }
}
