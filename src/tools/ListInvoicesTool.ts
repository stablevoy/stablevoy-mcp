import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { StoreClient } from '../stores/StoreClient.js';
import type { StoreClients } from '../stores/StoreClients.js';
import { invoiceView } from './InvoiceView.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface ListArgs {
  status?: string;
  source?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  cursor?: string;
  store?: string;
}

/** A page of invoices, newest first; without `store` and with several stores, one page per store (spec SPEC-mcp-server 3.3, 5). */
export class ListInvoicesTool implements Tool {
  readonly name = 'list_invoices';
  readonly title = 'List invoices';
  readonly description =
    'Invoices newest first, filtered by status, source, a search (invoice id or the start of the reference) and the UTC days they were created. One page per call; pass cursor with store to get the next page. Without store and with several stores, one page per store.';
  readonly input = {
    status: z.string().min(1).max(40).optional().describe('awaiting_payment, confirming, paid, overpaid, underpaid, paid_late, expired or on_hold.'),
    source: z.string().min(1).max(40).optional().describe('How the invoice was made: payment_link, woocommerce, edd, whmcs, api_key or not_recorded.'),
    search: z.string().min(1).max(200).optional().describe('Invoice id or the start of the reference.'),
    createdFrom: z.string().regex(DAY).optional().describe('First UTC day, YYYY-MM-DD.'),
    createdTo: z.string().regex(DAY).optional().describe('Last UTC day, YYYY-MM-DD.'),
    limit: z.number().int().min(1).max(100).optional().describe('Invoices per page, 20 by default.'),
    cursor: z.string().min(1).max(500).optional().describe('nextCursor of the previous page, with the same store.'),
    store: storeArgument,
  };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(args: ListArgs): Promise<CallToolResult> {
    try {
      if (args.cursor !== undefined && args.store === undefined && this.stores.several) {
        return { content: [{ type: 'text', text: 'cursor needs the store it came from: pass store too.' }], isError: true };
      }
      const clients = args.store === undefined && this.stores.several ? this.stores.all : [await this.stores.resolve(args.store)];
      const pages = await Promise.all(clients.map((client) => ListInvoicesTool.page(client, args)));
      const count = pages.reduce((sum, p) => sum + p.invoices.length, 0);
      return toolResult(`${count} invoice${count === 1 ? '' : 's'}${pages.some((p) => p.nextCursor !== null) ? ', more on the next page' : ''}.`, { pages });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  private static async page(client: StoreClient, args: ListArgs): Promise<{ store: string; invoices: Record<string, unknown>[]; nextCursor: string | null }> {
    const options = Object.fromEntries(Object.entries({ ...args, limit: args.limit ?? 20, store: undefined }).filter(([, v]) => v !== undefined));
    const page = await client.api.invoices.list(options);
    return { store: (await client.identity()).name, invoices: page.items.map(invoiceView), nextCursor: page.nextCursor };
  }
}
