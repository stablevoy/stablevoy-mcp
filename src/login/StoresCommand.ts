import type { CredentialStore } from '../credentials/CredentialStore.js';
import type { KeyRevoker } from './KeyRevoker.js';
import { keyPrefix, type Output } from './Output.js';
import { revokeKeys } from './RevokeKeys.js';

/** npx stablevoy-mcp stores [remove <store>]: what the profile holds, and dropping one store. Adding one needs login. */
export class StoresCommand {
  constructor(private readonly deps: { readonly credentials: CredentialStore; readonly revoke: KeyRevoker; readonly out: Output }) {}

  async list(profile: string): Promise<number> {
    const saved = await this.deps.credentials.read(profile);
    if (saved === null) {
      this.deps.out(`Profile ${profile} holds no keys. Run npx stablevoy-mcp login.`);
      return 0;
    }
    this.deps.out(`Profile ${profile} ("${saved.label}"):`);
    for (const key of saved.keys) this.deps.out(`  "${key.storeName}"  ${key.storeId}  ${keyPrefix(key.apiKey)}...`);
    return 0;
  }

  async remove(profile: string, store: string): Promise<number> {
    const saved = await this.deps.credentials.read(profile);
    const matches = saved?.keys.filter((k) => k.storeId === store || k.storeName === store) ?? [];
    const [match] = matches;
    if (saved === null || match === undefined || matches.length > 1) {
      this.deps.out(matches.length > 1 ? `Several stores are named "${store}": pass the store id.` : `Profile ${profile} has no store "${store}". See npx stablevoy-mcp stores.`);
      return 1;
    }
    if ((await revokeKeys([match], this.deps.revoke, this.deps.out)).length > 0) return 1;
    const rest = saved.keys.filter((k) => k !== match);
    if (rest.length === 0) await this.deps.credentials.remove(profile);
    else await this.deps.credentials.write(profile, { label: saved.label, keys: rest });
    this.deps.out(`Removed "${match.storeName}": its key is revoked.`);
    return 0;
  }
}
