import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { canAcceptPayments } from 'stablevoy';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { usdOf } from './AmountUsd.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** The store and its settings, read only (spec SPEC-mcp-server 3.3, 2). */
export class GetStoreTool implements Tool {
  readonly name = 'get_store';
  readonly title = 'Read a store and its settings';
  readonly description =
    'Gets one store with its settings, read only. Needs a store key (npx stablevoy-mcp login). Each call makes three live requests: the store, the platform limits and the fee. Nothing is cached, so a change made in the dashboard shows at once. Nothing here can change a setting. That is done in the Stablevoy dashboard. Returned, grouped: status and canAcceptPayments; networks and payout state, with the payout addresses this store uses, whether each is its own or the account one, and the account addresses; the invoice range in effect with the store and platform limits and the fee; the website, return and webhook addresses; archivedAt. Call it first when create_invoice fails or a store cannot accept payments. For the short view of all stores use list_stores. Leaving store out works only with one connected store. With several, the answer is an error listing their names and ids. The API takes up to 300 requests a minute from one address. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = { store: storeArgument };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: { store?: string }): Promise<CallToolResult> {
    try {
      const { api } = await this.stores.resolve(args.store);
      const [store, limits, pricing] = await Promise.all([api.stores.current(), api.platform.limits(), api.platform.pricing()]);
      const min = Math.max(limits.minInvoiceUsdCents, store.minInvoiceUsdCents ?? 0);
      const max = Math.min(limits.maxInvoiceUsdCents, store.maxInvoiceUsdCents ?? limits.maxInvoiceUsdCents);
      return toolResult(`Store "${store.name}" is ${store.status}; invoices from ${usdOf(min)} to ${usdOf(max)} USD.`, {
        id: store.id,
        name: store.name,
        status: store.status,
        canAcceptPayments: canAcceptPayments(store),
        enabledNetworks: store.enabledNetworks,
        networksWithoutPayout: store.networksWithoutPayout,
        payoutAddresses: store.payoutAddresses,
        payoutSources: store.payoutSources,
        accountPayoutAddresses: store.accountPayoutAddresses,
        evmPayoutStatus: store.evmPayoutStatus,
        evmNetworksBlocked: store.evmNetworksBlocked,
        invoiceRangeUsd: { min: usdOf(min), max: usdOf(max) },
        storeLimitsUsd: { min: store.minInvoiceUsdCents === null ? null : usdOf(store.minInvoiceUsdCents), max: store.maxInvoiceUsdCents === null ? null : usdOf(store.maxInvoiceUsdCents) },
        platformLimitsUsd: { min: usdOf(limits.minInvoiceUsdCents), max: usdOf(limits.maxInvoiceUsdCents) },
        feeBps: pricing.feeBps,
        websiteUrl: store.websiteUrl,
        defaultReturnUrl: store.defaultReturnUrl,
        webhookUrl: store.webhookUrl,
        connectedPlatform: store.connectedPlatform,
        archivedAt: store.archivedAt === null ? null : store.archivedAt.toISOString(),
      });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }
}
