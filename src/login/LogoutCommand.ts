import type { CredentialStore } from '../credentials/CredentialStore.js';
import type { KeyRevoker } from './KeyRevoker.js';
import type { Output } from './Output.js';
import { revokeKeys } from './RevokeKeys.js';

/** npx stablevoy-mcp logout: revokes every key of the profile; a key that could not be revoked stays in the file. */
export class LogoutCommand {
  constructor(private readonly deps: { readonly credentials: CredentialStore; readonly revoke: KeyRevoker; readonly out: Output }) {}

  async run(profile: string): Promise<number> {
    const saved = await this.deps.credentials.read(profile);
    if (saved === null) {
      this.deps.out(`Profile ${profile} holds no keys.`);
      return 0;
    }
    const failed = await revokeKeys(saved.keys, this.deps.revoke, this.deps.out);
    if (failed.length === 0) {
      await this.deps.credentials.remove(profile);
      this.deps.out(`Logged out: the keys of profile ${profile} are revoked and removed.`);
      return 0;
    }
    await this.deps.credentials.write(profile, { label: saved.label, keys: failed });
    return 1;
  }
}
