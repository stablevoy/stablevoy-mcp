import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { canAcceptPayments } from 'stablevoy';
import type { StoreClients } from '../stores/StoreClients.js';
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
    'Gets one store with its settings, read only. Returned: status and canAcceptPayments; networks (enabledNetworks, networksWithoutPayout, evmPayoutStatus, evmNetworksBlocked, payoutAddresses); limits (invoiceRangeUsd in effect, storeLimitsUsd, platformLimitsUsd, feeBps); addresses (websiteUrl, defaultReturnUrl, webhookUrl). Call it first when create_invoice fails or a store cannot accept payments. With one connected store leave store out and that store is read; with several, name one from list_stores, which also gives the short view of all. Settings change in the Stablevoy dashboard. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = { store: storeArgument };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

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
      });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }
}
