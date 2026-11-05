import { errorText } from '../tools/ToolError.js';
import type { StoredKey } from '../credentials/StoredKey.js';
import type { KeyRevoker } from './KeyRevoker.js';
import { keyPrefix, type Output } from './Output.js';

/** Revokes each key and says which could not be, so the merchant revokes those in the dashboard; never hides one. */
export async function revokeKeys(keys: readonly StoredKey[], revoke: KeyRevoker, out: Output): Promise<StoredKey[]> {
  const failed: StoredKey[] = [];
  for (const key of keys) {
    try {
      await revoke(key.apiKey);
    } catch (error) {
      failed.push(key);
      out(`Could not revoke the key ${keyPrefix(key.apiKey)}... of store "${key.storeName}": ${errorText(error)} Revoke it on the store page of the Stablevoy dashboard.`);
    }
  }
  return failed;
}
