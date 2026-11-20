import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { idempotencyKeyOf } from './IdempotencyKey.js';
import { currencyPriceOf, priceFormOf } from './InvoicePrice.js';
import { invoiceView, priceView } from './InvoiceView.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** A new invoice to receive money (spec SPEC-mcp-server 3.3, 3). Writes, so it is absent in read-only mode. */
export class CreateInvoiceTool implements Tool {
  readonly name = 'create_invoice';
  readonly title = 'Create an invoice';
  readonly description =
    'Creates a Stablevoy invoice the buyer pays in USDT or USDC and returns its payment link, checkoutUrl. Needs a store key (npx stablevoy-mcp login). Give the price as amountUsd, or as amount with currency when the merchant prices in another currency, for example "49.99" and "EUR". Such a price is turned into US dollars once, at creation, with the store\'s own rate or the ECB reference rate, and the invoice shows both in price. Send that link to the buyer yourself; Stablevoy does not email it. Give a reference (for example "acme-october") whenever you can: the same price and reference return the same invoice instead of a second one. returnUrl is an https page the buyer goes back to after paying. expiresInMinutes, 15 to 10080, is how long the buyer has; left out, the store default applies. After expiresAt the payment page tells the buyer not to pay, and money that still arrives is marked paid_late. To change the price of an unpaid invoice, cancel it with cancel_invoice first. Check the result later with get_invoice. Pass store when several stores are connected. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = {
    amountUsd: z.string().optional().describe('Price in US dollars as a decimal string, for example "250" or "19.99". Leave it out when you give amount and currency.'),
    amount: z.string().optional().describe('Price in currency as a decimal string, for example "49.99" for EUR or "1500" for JPY. Goes with currency, instead of amountUsd.'),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .optional()
      .describe('ISO 4217 code of amount, for example "EUR". 30 currencies are supported; another one gives currency_not_supported with the list.'),
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

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: { amountUsd?: string; amount?: string; currency?: string; reference?: string; returnUrl?: string; expiresInMinutes?: number; store?: string }): Promise<CallToolResult> {
    const form = priceFormOf(args);
    if ('error' in form) return { content: [{ type: 'text', text: form.error }], isError: true };
    if (args.returnUrl !== undefined && !args.returnUrl.startsWith('https://')) return { content: [{ type: 'text', text: 'invalid_return_url: returnUrl must use https.' }], isError: true };
    try {
      const client = await this.stores.resolve(args.store);
      const price = 'price' in form ? form.price : currencyPriceOf(form.amount, form.currency, await client.api.currencies.list());
      if (typeof price === 'string') return { content: [{ type: 'text', text: price }], isError: true };
      const options = args.reference === undefined ? {} : { idempotencyKey: idempotencyKeyOf((await client.identity()).id, price.key, args.reference) };
      const created = await client.api.invoices.create({ ...price.body, ...(args.reference === undefined ? {} : { externalReference: args.reference }), ...(args.returnUrl === undefined ? {} : { returnUrl: args.returnUrl }), ...(args.expiresInMinutes === undefined ? {} : { expiresInMinutes: args.expiresInMinutes }) }, options);
      const view = invoiceView(created.invoice);
      const shown = priceView(created.invoice.pricing ?? null);
      const priced = shown === null ? '' : ` for ${String(shown['amount'])} ${String(shown['currency'])} (${String(view['amountUsd'])} USD)`;
      const summary = created.replayed ? `This invoice already existed for that price and reference: ${created.checkoutUrl}` : `Invoice created${priced}. Payment link: ${created.checkoutUrl}`;
      return toolResult(summary, { ...view, checkoutUrl: created.checkoutUrl, unavailableNetworks: created.unavailableNetworks, replayed: created.replayed });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }
}
