import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NotFoundError, type CheckoutTrail } from 'stablevoy';
import { z } from 'zod';
import type { StoreClient } from '../stores/StoreClient.js';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** The payment page steps of one invoice; without `store` and with several stores each store is asked in turn (spec SPEC-checkout-analytics 10.1). */
export class GetCheckoutTrailTool implements Tool {
  readonly name = 'get_checkout_trail';
  readonly title = 'Read the payment page steps of an invoice';
  readonly description =
    'Gets the steps one invoice went through, oldest first, each with the time it was first reached. Needs a store key (npx stablevoy-mcp login). The steps are created, what the payment page reported (opened with page or widget, option_changed, details_copied, wallet_started, wallet_rejected, wallet_failed, tx_sent), the first payment seen (detected) and the outcome (paid, expired or cancelled). Use it to see where a buyer stopped. A buyer who pays from another device skips page steps. Without store every connected store is asked; an id no store has gives not_found. Use get_checkout_funnel for the counts of a period and get_invoice for the payments. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = { invoiceId: z.uuid().describe('The invoice id.'), store: storeArgument };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: { invoiceId: string; store?: string }): Promise<CallToolResult> {
    try {
      const candidates = args.store === undefined && this.stores.several ? this.stores.all : [await this.stores.resolve(args.store)];
      for (const client of candidates) {
        const trail = await GetCheckoutTrailTool.find(client, args.invoiceId);
        if (trail === null) continue;
        const store = (await client.identity()).name;
        const last = trail.steps.at(-1);
        const line = `Invoice ${trail.invoiceId} of store "${store}": ${trail.steps.length} step${trail.steps.length === 1 ? '' : 's'}${last === undefined ? '' : `, last ${last.step}`}.`;
        return toolResult(line, { store, invoiceId: trail.invoiceId, steps: trail.steps.map((s) => ({ step: s.step, at: s.at.toISOString(), surface: s.surface })) });
      }
      return { content: [{ type: 'text', text: `not_found: no connected store has invoice ${args.invoiceId}.` }], isError: true };
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  private static async find(client: StoreClient, invoiceId: string): Promise<CheckoutTrail | null> {
    try {
      return await client.api.invoices.checkoutTrail(invoiceId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
