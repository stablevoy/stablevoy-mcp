import { NotSignedInError } from './NotSignedInError.js';
import type { StoreClient } from './StoreClient.js';
import type { StoreDirectory } from './StoreDirectory.js';

/**
 * The store directory of a server without a store key. The store tools are wrapped in SignedOutTool and never reach it;
 * should one do, every use fails loudly with not_signed_in instead of looking like a server with no stores.
 */
export class SignedOutStores implements StoreDirectory {
  get all(): readonly StoreClient[] {
    throw new NotSignedInError();
  }

  get several(): boolean {
    throw new NotSignedInError();
  }

  targets(): Promise<readonly [StoreClient, ...StoreClient[]]> {
    return Promise.reject(new NotSignedInError());
  }

  resolve(): Promise<StoreClient> {
    return Promise.reject(new NotSignedInError());
  }
}
