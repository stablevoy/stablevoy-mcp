import type { Stablevoy } from 'stablevoy';

export interface StoreIdentity {
  readonly id: string;
  readonly name: string;
}

/** The SDK client of one store key. A key from STABLEVOY_API_KEY learns its store on first use; a login key knows it. */
export class StoreClient {
  private known: StoreIdentity | null;

  constructor(
    readonly api: Stablevoy,
    known: StoreIdentity | null,
  ) {
    this.known = known;
  }

  async identity(): Promise<StoreIdentity> {
    if (this.known === null) {
      const store = await this.api.stores.current();
      this.known = { id: store.id, name: store.name };
    }
    return this.known;
  }
}
