import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { StoreClients } from '../stores/StoreClients.js';
import { centsOf } from './AmountUsd.js';
import { idempotencyKeyOf } from './IdempotencyKey.js';
import { invoiceView } from './InvoiceView.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** A new invoice to receive money (spec SPEC-mcp-server 3.3, 3). The only tool that writes; absent in read-only mode. */
export class CreateInvoiceTool implements Tool {
  readonly name = 'create_invoice';
  readonly title = 'Create an invoice';
  readonly description =
    'Creates a Stablevoy invoice the buyer pays in USDT or USDC, and returns its payment link (checkoutUrl). Give a reference (for example "acme-october") whenever you can: the same amount and reference return the same invoice instead of a second one. Without a reference every call creates a new invoice.';
  readonly input = {
    amountUsd: z.string().describe('Amount in US dollars as a decimal string, for example "250" or "19.99".'),
    reference: z.string().min(1).max(200).optional().describe('Your reference for this invoice, sent back in webhooks, 1 to 200 characters.'),
    returnUrl: z.url().max(2048).optional().describe('https address the buyer returns to after paying.'),
    store: storeArgument,
  };
  readonly annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(args: { amountUsd: string; reference?: string; returnUrl?: string; store?: string }): Promise<CallToolResult> {
    const cents = centsOf(args.amountUsd);
    if (cents === null || cents === 0) return { content: [{ type: 'text', text: 'invalid_amount: amountUsd must be a positive amount in dollars with at most two decimals, for example "19.99".' }], isError: true };
    if (args.returnUrl !== undefined && !args.returnUrl.startsWith('https://')) return { content: [{ type: 'text', text: 'invalid_return_url: returnUrl must use https.' }], isError: true };
    try {
      const client = await this.stores.resolve(args.store);
      const options = args.reference === undefined ? {} : { idempotencyKey: idempotencyKeyOf((await client.identity()).id, cents, args.reference) };
      const created = await client.api.invoices.create({ amountUsdCents: cents, ...(args.reference === undefined ? {} : { externalReference: args.reference }), ...(args.returnUrl === undefined ? {} : { returnUrl: args.returnUrl }) }, options);
      const summary = created.replayed ? `This invoice already existed for that amount and reference: ${created.checkoutUrl}` : `Invoice created. Payment link: ${created.checkoutUrl}`;
      return toolResult(summary, { ...invoiceView(created.invoice), checkoutUrl: created.checkoutUrl, unavailableNetworks: created.unavailableNetworks, replayed: created.replayed });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }
}
