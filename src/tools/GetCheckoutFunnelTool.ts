import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SummaryPeriod, type CheckoutFunnel, type InvoiceSummaryInput, type SummaryPeriodName } from 'stablevoy';
import { z } from 'zod';
import type { StoreClient } from '../stores/StoreClient.js';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = Object.values(SummaryPeriod) as [SummaryPeriodName, ...SummaryPeriodName[]];

interface FunnelArgs {
  period?: SummaryPeriodName;
  createdFrom?: string;
  createdTo?: string;
  store?: string;
}

interface Counts {
  invoices: number;
  steps: Record<string, number>;
  openedOn: Record<string, number>;
  detected: number;
  paid: number;
}

/** Where buyers stop on the payment page, per store and in total (spec SPEC-checkout-analytics 10.1). */
export class GetCheckoutFunnelTool implements Tool {
  readonly name = 'get_checkout_funnel';
  readonly title = 'Read where buyers stop on the payment page';
  readonly description =
    'Gets where buyers stop on the payment page for the invoices created in a period. Needs a store key (npx stablevoy-mcp login). It counts invoices, not visits: how many were opened (on the hosted page or in the widget), had the network or token changed, had the details copied, started a wallet, were refused or failed in the wallet, had a transaction sent, saw a payment (detected) and were paid. Nothing about the buyer is kept. A buyer who pays from another device skips page steps, so read it as a guide. Pass either period or both createdFrom and createdTo as UTC days, at most 92 days per call. A period together with dates, or only one date, is refused. Without store and with several stores you get one funnel per store plus a total. Use get_checkout_trail for the steps of one invoice and summarize_payments for the money. The API allows 30 calls a minute per store. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = {
    period: z.enum(PERIODS).optional().describe('A ready-made range of UTC days ending today. Leave out when giving dates.'),
    createdFrom: z.string().regex(DAY).optional().describe('First UTC day, YYYY-MM-DD, with createdTo.'),
    createdTo: z.string().regex(DAY).optional().describe('Last UTC day, YYYY-MM-DD, included.'),
    store: storeArgument,
  };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: FunnelArgs): Promise<CallToolResult> {
    const input = GetCheckoutFunnelTool.inputOf(args);
    if (input === null) return { content: [{ type: 'text', text: 'Pass either period or both createdFrom and createdTo.' }], isError: true };
    try {
      const [head, ...others] = await this.stores.targets(args.store);
      const [first, ...rest] = await Promise.all([GetCheckoutFunnelTool.funnelOf(head, input), ...others.map((client) => GetCheckoutFunnelTool.funnelOf(client, input))]);
      const funnels = [first, ...rest];
      const total = GetCheckoutFunnelTool.add(funnels.map((f) => f.funnel));
      const line = `${total.invoices} invoice${total.invoices === 1 ? '' : 's'} from ${first.funnel.createdFrom} to ${first.funnel.createdTo}: ${total.detected} saw a payment, ${total.paid} paid.`;
      const range = { createdFrom: first.funnel.createdFrom, createdTo: first.funnel.createdTo };
      if (rest.length === 0) return toolResult(line, { store: first.store, ...range, ...total });
      return toolResult(line, { stores: funnels.map((f) => ({ store: f.store, ...range, ...GetCheckoutFunnelTool.add([f.funnel]) })), total: { ...range, ...total } });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  /** A period alone or both days; any other mix is refused before the API is called. */
  private static inputOf(args: FunnelArgs): InvoiceSummaryInput | null {
    const { period, createdFrom, createdTo } = args;
    if (period !== undefined && createdFrom === undefined && createdTo === undefined) return { period };
    if (period === undefined && createdFrom !== undefined && createdTo !== undefined) return { createdFrom, createdTo };
    return null;
  }

  private static async funnelOf(client: StoreClient, input: InvoiceSummaryInput): Promise<{ store: string; funnel: CheckoutFunnel }> {
    const funnel = await client.api.stores.checkoutFunnel(input);
    return { store: (await client.identity()).name, funnel };
  }

  private static add(funnels: readonly CheckoutFunnel[]): Counts {
    const sum = (into: Record<string, number>, from: Readonly<Record<string, number>>): void => {
      for (const [name, count] of Object.entries(from)) into[name] = (into[name] ?? 0) + count;
    };
    const counts: Counts = { invoices: 0, steps: {}, openedOn: {}, detected: 0, paid: 0 };
    for (const f of funnels) {
      counts.invoices += f.invoices;
      sum(counts.steps, f.steps);
      sum(counts.openedOn, f.openedOn);
      counts.detected += f.detected;
      counts.paid += f.paid;
    }
    return counts;
  }
}
