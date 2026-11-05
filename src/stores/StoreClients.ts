import { StoreChoiceError } from './StoreChoiceError.js';
import type { StoreClient } from './StoreClient.js';

/**
 * The stores this server has a key for (spec SPEC-mcp-server 3.3, 0). One store needs no `store` argument; with several
 * a call without it, or with a name or id that matches none or several, is an error that lists the stores.
 */
export class StoreClients {
  constructor(readonly all: readonly StoreClient[]) {
    if (all.length === 0) throw new Error('StoreClients needs at least one store key');
  }

  get several(): boolean {
    return this.all.length > 1;
  }

  async resolve(store: string | undefined): Promise<StoreClient> {
    const [only] = this.all;
    if (store === undefined) {
      if (only !== undefined && !this.several) return only;
      throw new StoreChoiceError(`Several stores are connected; pass store with one of: ${await this.names()}`);
    }
    const identities = await Promise.all(this.all.map(async (client) => ({ client, identity: await client.identity() })));
    const byId = identities.find((s) => s.identity.id === store);
    if (byId !== undefined) return byId.client;
    const byName = identities.filter((s) => s.identity.name === store);
    const [named] = byName;
    if (named !== undefined && byName.length === 1) return named.client;
    if (byName.length > 1) throw new StoreChoiceError(`Several stores are named "${store}"; pass the store id instead: ${await this.names()}`);
    throw new StoreChoiceError(`No connected store is "${store}". Connected stores: ${await this.names()}`);
  }

  private async names(): Promise<string> {
    const identities = await Promise.all(this.all.map((client) => client.identity()));
    return identities.map((s) => `"${s.name}" (${s.id})`).join(', ');
  }
}
