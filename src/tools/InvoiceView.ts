import type { Invoice } from 'stablevoy';
import { usdOf } from './AmountUsd.js';

/** An invoice as the model sees it: dollars as strings, dates as ISO text, the payments that came in. */
export function invoiceView(invoice: Invoice): Record<string, unknown> {
  return {
    id: invoice.id,
    status: invoice.status,
    amountUsd: usdOf(invoice.amountUsdCents),
    reference: invoice.externalReference,
    createdAt: invoice.createdAt.toISOString(),
    expiresAt: invoice.expiresAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    holdReason: invoice.holdReason,
    networks: invoice.depositAddresses.map((d) => d.network),
    payments: invoice.payments.map((p) => ({ network: p.network, token: p.token, amount: p.amount, txHash: p.txHash, status: p.status, detectedAt: p.detectedAt.toISOString() })),
  };
}
