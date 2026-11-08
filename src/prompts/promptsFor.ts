import { ClientPaymentsPrompt } from './ClientPaymentsPrompt.js';
import { GettingStartedPrompt } from './GettingStartedPrompt.js';
import { PaymentsSummaryPrompt } from './PaymentsSummaryPrompt.js';
import type { Prompt } from './Prompt.js';
import { ReviewUnmatchedTransfersPrompt } from './ReviewUnmatchedTransfersPrompt.js';
import { UnpaidInvoicesPrompt } from './UnpaidInvoicesPrompt.js';

/**
 * Every prompt, in every mode (spec SPEC-mcp-prompts-resources 5): none of them writes, so read-only keeps them all, and
 * without a key the store tools they call answer not_signed_in, which tells the user what to do.
 */
export function promptsFor(signedIn: boolean): Prompt[] {
  return [new PaymentsSummaryPrompt(), new UnpaidInvoicesPrompt(), new ClientPaymentsPrompt(), new ReviewUnmatchedTransfersPrompt(), new GettingStartedPrompt(signedIn)];
}
