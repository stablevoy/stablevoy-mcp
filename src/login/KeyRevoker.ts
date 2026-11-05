import { AuthenticationError, Stablevoy, type ConnectionOptions } from 'stablevoy';

/** Revokes one store key with the key itself (DELETE /v1/store/api-keys/current). A key already refused counts as revoked. */
export type KeyRevoker = (apiKey: string) => Promise<void>;

export function sdkKeyRevoker(connection: ConnectionOptions): KeyRevoker {
  return async (apiKey) => {
    try {
      await Stablevoy.create({ ...connection, apiKey }).stores.revokeCurrentKey();
    } catch (error) {
      if (error instanceof AuthenticationError) return;
      throw error;
    }
  };
}
