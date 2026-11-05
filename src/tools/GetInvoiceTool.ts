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

/** One invoice by id; without `store` and with several stores, each store is asked in turn (spec SPEC-mcp-server 3.3, 4). */
export class GetInvoiceTool implements Tool {
  readonly name = 'get_invoice';
  readonly title = 'Read an invoice';
  readonly description = 'An invoice by its id: status, amount, payments received (network, token, amount in the token smallest units, transaction hash), and when it was paid or expires.';
  readonly input = { invoiceId: z.uuid().describe('The invoice id.'), store: storeArgument };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(args: { invoiceId: string; store?: string }): Promise<CallToolResult> {
    try {
      const candidates = args.store === undefined && this.stores.several ? this.stores.all : [await this.stores.resolve(args.store)];
      for (const client of candidates) {
        const invoice = await GetInvoiceTool.find(client, args.invoiceId);
        if (invoice !== null) return toolResult(`Invoice ${invoice.id} of store "${(await client.identity()).name}" is ${invoice.status}.`, { store: (await client.identity()).name, ...invoiceView(invoice) });
      }
      return { content: [{ type: 'text', text: `not_found: no connected store has invoice ${args.invoiceId}.` }], isError: true };
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  private static async find(client: StoreClient, invoiceId: string): Promise<Invoice | null> {
    try {
      return await client.api.invoices.get(invoiceId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
