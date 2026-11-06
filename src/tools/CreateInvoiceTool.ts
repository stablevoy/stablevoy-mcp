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

/** A new invoice to receive money (spec SPEC-mcp-server 3.3, 3). Writes, so it is absent in read-only mode. */
export class CreateInvoiceTool implements Tool {
  readonly name = 'create_invoice';
  readonly title = 'Create an invoice';
  readonly description =
    'Creates a Stablevoy invoice the buyer pays in USDT or USDC, and returns its payment link (checkoutUrl). Give a reference (for example "acme-october") whenever you can: the same amount and reference return the same invoice instead of a second one. Without a reference every call creates a new invoice. The result also has expiresAt: after it the payment page tells the buyer not to pay, and a payment that still arrives late is marked paid_late. Send checkoutUrl to the buyer yourself; Stablevoy does not email it. Pass store when several stores are connected. Do not create a second invoice to change the amount of an unpaid one: cancel it with cancel_invoice first. Check the result later with get_invoice. Uses the store\'s API key; a failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = {
    amountUsd: z.string().describe('Amount in US dollars as a decimal string, for example "250" or "19.99".'),
    reference: z.string().min(1).max(200).optional().describe('Your reference for this invoice, sent back in webhooks, 1 to 200 characters.'),
    returnUrl: z.url().max(2048).optional().describe('https address the buyer returns to after paying.'),
    expiresInMinutes: z
      .number()
      .int()
      .min(15)
      .max(10_080)
      .optional()
      .describe('How long the buyer has to pay, 15 to 10080 minutes; leave it out for the store default. Use a day or more for an invoice sent by email.'),
    store: storeArgument,
  };
  readonly annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(args: { amountUsd: string; reference?: string; returnUrl?: string; expiresInMinutes?: number; store?: string }): Promise<CallToolResult> {
    const cents = centsOf(args.amountUsd);
    if (cents === null || cents === 0) return { content: [{ type: 'text', text: 'invalid_amount: amountUsd must be a positive amount in dollars with at most two decimals, for example "19.99".' }], isError: true };
    if (args.returnUrl !== undefined && !args.returnUrl.startsWith('https://')) return { content: [{ type: 'text', text: 'invalid_return_url: returnUrl must use https.' }], isError: true };
    try {
      const client = await this.stores.resolve(args.store);
      const options = args.reference === undefined ? {} : { idempotencyKey: idempotencyKeyOf((await client.identity()).id, cents, args.reference) };
      const created = await client.api.invoices.create({ amountUsdCents: cents, ...(args.reference === undefined ? {} : { externalReference: args.reference }), ...(args.returnUrl === undefined ? {} : { returnUrl: args.returnUrl }), ...(args.expiresInMinutes === undefined ? {} : { expiresInMinutes: args.expiresInMinutes }) }, options);
      const summary = created.replayed ? `This invoice already existed for that amount and reference: ${created.checkoutUrl}` : `Invoice created. Payment link: ${created.checkoutUrl}`;
      return toolResult(summary, { ...invoiceView(created.invoice), checkoutUrl: created.checkoutUrl, unavailableNetworks: created.unavailableNetworks, replayed: created.replayed });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }
}
