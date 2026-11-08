import type { StoreClient } from './StoreClient.js';

/** The stores a tool works on. StoreClients holds the real keys; SignedOutStores stands in when there is none. */
export interface StoreDirectory {
  readonly all: readonly StoreClient[];
  readonly several: boolean;
  /** The store named by `store`, or every store when it is left out and several are connected; never empty. */
  targets(store: string | undefined): Promise<readonly [StoreClient, ...StoreClient[]]>;
  resolve(store: string | undefined): Promise<StoreClient>;
}
