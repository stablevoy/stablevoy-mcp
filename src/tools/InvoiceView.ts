import type { Invoice, InvoicePricing } from 'stablevoy';
import { decimalOf, usdOf } from './AmountUsd.js';

/** An invoice as the model sees it: dollars as strings, dates as ISO text, the payments that came in. */
export function invoiceView(invoice: Invoice): Record<string, unknown> {
  return {
    id: invoice.id,
    status: invoice.status,
    amountUsd: usdOf(invoice.amountUsdCents),
    price: priceView(invoice.pricing ?? null),
    reference: invoice.externalReference,
    createdAt: invoice.createdAt.toISOString(),
    expiresAt: invoice.expiresAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    holdReason: invoice.holdReason,
    networks: invoice.depositAddresses.map((d) => d.network),
    payments: invoice.payments.map((p) => ({ network: p.network, token: p.token, amount: p.amount, txHash: p.txHash, status: p.status, detectedAt: p.detectedAt.toISOString() })),
  };
}

/** The price in the shop currency and the rate fixed at creation; null for an invoice priced in US dollars. */
export function priceView(pricing: InvoicePricing | null): Record<string, unknown> | null {
  if (pricing === null) return null;
  return { currency: pricing.currency, amount: decimalOf(pricing.amount, pricing.exponent), usdPerUnit: pricing.usdPerUnit, rateSource: pricing.rateSource, rateAt: pricing.rateAt.toISOString() };
}
