import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NotFoundError, type Invoice } from 'stablevoy';
import { z } from 'zod';
import type { StoreClient } from '../stores/StoreClient.js';
import type { StoreClients } from '../stores/StoreClients.js';
import { invoiceView } from './InvoiceView.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/**
 * Cancels an unpaid invoice (spec SPEC-invoice-cancel 5). Writes, so it is absent in read-only mode. Without `store` and
 * with several stores each store is asked in turn: only the store that owns the invoice can cancel it, the others answer
 * not_found.
 */
export class CancelInvoiceTool implements Tool {
  readonly name = 'cancel_invoice';
  readonly title = 'Cancel an unpaid invoice';
  readonly description =
    'Cancels an unpaid invoice so the buyer can no longer pay it. Works only while no payment has been seen; otherwise it returns invoice_not_cancellable and the invoice stays as it is. A payment that still arrives later is marked paid_late. Cancelling an already cancelled invoice returns it unchanged. Use get_invoice first if you are not sure of its status. Uses the store\'s API key; a failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = { invoiceId: z.uuid().describe('The invoice id.'), store: storeArgument };
  readonly annotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(args: { invoiceId: string; store?: string }): Promise<CallToolResult> {
    try {
      const candidates = args.store === undefined && this.stores.several ? this.stores.all : [await this.stores.resolve(args.store)];
      for (const client of candidates) {
        const invoice = await CancelInvoiceTool.cancel(client, args.invoiceId);
        if (invoice !== null) return toolResult(`Invoice ${invoice.id} of store "${(await client.identity()).name}" is ${invoice.status}.`, { store: (await client.identity()).name, ...invoiceView(invoice) });
      }
      return { content: [{ type: 'text', text: `not_found: no connected store has invoice ${args.invoiceId}.` }], isError: true };
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  private static async cancel(client: StoreClient, invoiceId: string): Promise<Invoice | null> {
    try {
      return await client.api.invoices.cancel(invoiceId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
