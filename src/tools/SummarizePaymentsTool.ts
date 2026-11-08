import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SummaryPeriod, type InvoiceSummary, type InvoiceSummaryInput, type SummaryPeriodName } from 'stablevoy';
import { z } from 'zod';
import type { StoreClient } from '../stores/StoreClient.js';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { usdOf, usdOfMicros } from './AmountUsd.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = Object.values(SummaryPeriod) as [SummaryPeriodName, ...SummaryPeriodName[]];

interface SummaryArgs {
  period?: SummaryPeriodName;
  createdFrom?: string;
  createdTo?: string;
  store?: string;
}

interface Totals {
  invoiceCount: number;
  byStatus: Record<string, number>;
  invoicedCents: number;
  receivedMicros: bigint;
  byNetwork: Map<string, { network: string; token: string; payments: number; micros: bigint }>;
}

/** Counts and money of the invoices of a period, per store and in total (spec SPEC-mcp-docs-summary-unmatched 3.3). */
export class SummarizePaymentsTool implements Tool {
  readonly name = 'summarize_payments';
  readonly title = 'Sum up invoices and payments for a period';
  readonly description =
    'Sums up the invoices created in a period, instead of paging through list_invoices. Needs a store key (npx stablevoy-mcp login). It returns how many invoices are in each status, invoicedUsd (cancelled and expired left out), receivedUsd (confirmed payments that passed sanctions screening) and the money per network and token. Pass either period or both createdFrom and createdTo as UTC days. A period together with dates, or only one of the two dates, is refused. One call covers at most 92 days; ask for a year in four quarters. Without store and with several stores you get one summary per store plus a total. Use list_invoices to see the invoices themselves. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = {
    period: z.enum(PERIODS).optional().describe('A ready-made range of UTC days ending today. Leave out when giving dates.'),
    createdFrom: z.string().regex(DAY).optional().describe('First UTC day, YYYY-MM-DD, with createdTo.'),
    createdTo: z.string().regex(DAY).optional().describe('Last UTC day, YYYY-MM-DD, included.'),
    store: storeArgument,
  };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: SummaryArgs): Promise<CallToolResult> {
    const input = SummarizePaymentsTool.inputOf(args);
    if (input === null) return { content: [{ type: 'text', text: 'Pass either period or both createdFrom and createdTo.' }], isError: true };
    try {
      const [head, ...others] = await this.stores.targets(args.store);
      const [first, ...rest] = await Promise.all([SummarizePaymentsTool.summaryOf(head, input), ...others.map((client) => SummarizePaymentsTool.summaryOf(client, input))]);
      const summaries = [first, ...rest];
      const total = SummarizePaymentsTool.add(summaries.map((s) => s.summary));
      const range = `${first.summary.createdFrom} to ${first.summary.createdTo}`;
      const line = `${total.invoiceCount} invoice${total.invoiceCount === 1 ? '' : 's'} from ${range}, ${usdOfMicros(total.receivedMicros)} USD received.`;
      const stores = summaries.map((s) => ({ store: s.store, ...SummarizePaymentsTool.view(SummarizePaymentsTool.add([s.summary]), s.summary) }));
      if (rest.length === 0) return toolResult(line, { store: first.store, ...SummarizePaymentsTool.view(total, first.summary) });
      return toolResult(line, { stores, total: SummarizePaymentsTool.view(total, first.summary) });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  /** A period alone or both days; any other mix is refused before the API is called. */
  private static inputOf(args: SummaryArgs): InvoiceSummaryInput | null {
    const { period, createdFrom, createdTo } = args;
    if (period !== undefined && createdFrom === undefined && createdTo === undefined) return { period };
    if (period === undefined && createdFrom !== undefined && createdTo !== undefined) return { createdFrom, createdTo };
    return null;
  }

  private static async summaryOf(client: StoreClient, input: InvoiceSummaryInput): Promise<{ store: string; summary: InvoiceSummary }> {
    const summary = await client.api.invoices.summary(input);
    return { store: (await client.identity()).name, summary };
  }

  private static add(summaries: readonly InvoiceSummary[]): Totals {
    const totals: Totals = { invoiceCount: 0, byStatus: {}, invoicedCents: 0, receivedMicros: 0n, byNetwork: new Map() };
    for (const s of summaries) {
      totals.invoiceCount += s.invoiceCount;
      for (const [status, count] of Object.entries(s.invoicesByStatus)) totals.byStatus[status] = (totals.byStatus[status] ?? 0) + count;
      totals.invoicedCents += s.invoicedUsdCents;
      totals.receivedMicros += BigInt(s.receivedUsdMicros);
      for (const n of s.byNetwork) {
        const key = `${n.network} ${n.token}`;
        const sum = totals.byNetwork.get(key) ?? { network: n.network, token: n.token, payments: 0, micros: 0n };
        totals.byNetwork.set(key, { ...sum, payments: sum.payments + n.payments, micros: sum.micros + BigInt(n.receivedUsdMicros) });
      }
    }
    return totals;
  }

  private static view(totals: Totals, range: InvoiceSummary): Record<string, unknown> {
    return {
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
      invoices: { count: totals.invoiceCount, byStatus: totals.byStatus },
      invoicedUsd: usdOf(totals.invoicedCents),
      receivedUsd: usdOfMicros(totals.receivedMicros),
      byNetwork: [...totals.byNetwork.values()].map((n) => ({ network: n.network, token: n.token, payments: n.payments, receivedUsd: usdOfMicros(n.micros) })),
    };
  }
}
