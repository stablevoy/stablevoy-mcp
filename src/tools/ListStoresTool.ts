import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { canAcceptPayments } from 'stablevoy';
import type { StoreClients } from '../stores/StoreClients.js';
import type { Tool } from './Tool.js';
import { errorText } from './ToolError.js';
import { toolResult } from './ToolResult.js';

/** The connected stores. A store whose key fails is listed with its error, the others still are. */
export class ListStoresTool implements Tool {
  readonly name = 'list_stores';
  readonly title = 'List connected stores';
  readonly description =
    'Lists the Stablevoy stores this server can work with. Returns stores: one entry per connected store with id, name, status, enabledNetworks, canAcceptPayments and evmPayoutStatus, or an error for a store whose key no longer works. Call it first to learn store names for the store argument of the other tools; use get_store for the full settings of one store.';
  readonly input = {};
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(private readonly stores: StoreClients) {}

  async run(): Promise<CallToolResult> {
    const rows = await Promise.all(
      this.stores.all.map(async (client) => {
        try {
          const store = await client.api.stores.current();
          return { id: store.id, name: store.name, status: store.status, enabledNetworks: store.enabledNetworks, canAcceptPayments: canAcceptPayments(store), evmPayoutStatus: store.evmPayoutStatus };
        } catch (error) {
          return { error: errorText(error) };
        }
      }),
    );
    return toolResult(`${rows.length} store${rows.length === 1 ? '' : 's'} connected.`, { stores: rows });
  }
}
