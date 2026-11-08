import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnmatchedTransfer } from 'stablevoy';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { usdOfMicros } from './AmountUsd.js';
import { storeArgument } from './StoreArgument.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** Payments to the payout wallet that matched no invoice, read only (spec SPEC-mcp-docs-summary-unmatched 3.4). */
export class ListUnmatchedTransfersTool implements Tool {
  readonly name = 'list_unmatched_transfers';
  readonly title = 'List unmatched transfers';
  readonly description =
    'Lists payments that reached the merchant\'s own Tron wallet but matched no invoice, newest first. Needs a store key (npx stablevoy-mcp login). This usually happens when an exchange took its fee out of the amount. At most the 100 newest are returned; there is no paging past them. Each transfer has amountUsd, network, token, fromAddress, txHash, explorerUrl, detectedAt and the stores it was listed for. sharedWithStores tells whose it is: the payout wallet belongs to the account, so 1 means the transfer is certainly that store\'s and more means it may belong to any of that many stores. You cannot attach a transfer to an invoice: tell the merchant to do it in the Stablevoy dashboard, Unmatched transfers section. Use get_invoice or list_invoices to find the invoice the buyer meant. Without store and with several stores, every store is asked and each transfer is listed once. A failure comes back as an error with its code and what to do, for example rate_limited with the seconds to wait.';
  readonly input = { store: storeArgument };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreDirectory) {}

  async run(args: { store?: string }): Promise<CallToolResult> {
    try {
      const clients = await this.stores.targets(args.store);
      const lists = await Promise.all(clients.map(async (client) => ({ store: (await client.identity()).name, transfers: await client.api.unmatchedTransfers.list() })));
      const byId = new Map<string, { transfer: UnmatchedTransfer; stores: string[] }>();
      for (const { store, transfers } of lists) {
        for (const transfer of transfers) {
          const seen = byId.get(transfer.id);
          if (seen === undefined) byId.set(transfer.id, { transfer, stores: [store] });
          else seen.stores.push(store);
        }
      }
      const transfers = [...byId.values()].sort((a, b) => b.transfer.detectedAt.getTime() - a.transfer.detectedAt.getTime()).map(({ transfer, stores }) => ListUnmatchedTransfersTool.view(transfer, stores));
      const line = transfers.length === 0 ? 'No unmatched transfers.' : `${transfers.length} unmatched transfer${transfers.length === 1 ? '' : 's'}; the merchant attaches them to invoices in the dashboard.`;
      return toolResult(line, { transfers });
    } catch (error) {
      return toolError(error, args.store ?? null);
    }
  }

  private static view(t: UnmatchedTransfer, stores: readonly string[]): Record<string, unknown> {
    return {
      id: t.id,
      amountUsd: usdOfMicros(t.amountUsdMicros),
      network: t.network,
      token: t.tokenSymbol,
      fromAddress: t.fromAddress,
      payoutAddress: t.payoutAddress,
      txHash: t.txHash,
      // Tronscan takes the hash without its 0x prefix (the API's explorerTxUrl description).
      explorerUrl: `${t.explorerTxUrl}${t.network === 'tron' ? t.txHash.replace(/^0x/, '') : t.txHash}`,
      detectedAt: t.detectedAt.toISOString(),
      stores,
      sharedWithStores: t.sharedWithStores,
    };
  }
}
