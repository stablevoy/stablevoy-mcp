import type { StablevoyConnect } from 'stablevoy';
import type { CredentialStore } from '../credentials/CredentialStore.js';
import type { BrowserOpener } from './BrowserOpener.js';
import type { KeyRevoker } from './KeyRevoker.js';
import type { Output } from './Output.js';
import type { LoopbackListener } from './LoopbackListener.js';
import { pkcePair, randomState } from './Pkce.js';
import { revokeKeys } from './RevokeKeys.js';

const LABEL = /^[\x20-\x7e]{1,40}$/;
export const LOGIN_TIMEOUT_MS = 5 * 60_000;

/**
 * npx stablevoy-mcp login (spec SPEC-mcp-server 10.2): the merchant approves this computer for a set of stores in the
 * dashboard, the browser brings the code back to the loopback listener, and the code becomes one key per store. The
 * selection replaces what the profile held: the new keys are saved first, then every old key of the profile is revoked.
 */
export class LoginCommand {
  constructor(
    private readonly deps: {
      readonly credentials: CredentialStore;
      readonly connect: StablevoyConnect;
      readonly revoke: KeyRevoker;
      readonly listen: () => Promise<LoopbackListener>;
      readonly openBrowser: BrowserOpener;
      readonly connectUrl: string;
      readonly out: Output;
      readonly timeoutMs: number;
    },
  ) {}

  /** Exit code: 0 when everything worked, 1 when the login failed or an old key could not be revoked. */
  async run(profile: string, label: string): Promise<number> {
    const { out } = this.deps;
    const name = label.trim();
    if (!LABEL.test(name)) {
      out('The computer name (--name) must be 1 to 40 plain characters.');
      return 1;
    }
    const before = await this.deps.credentials.read(profile);
    const listener = await this.deps.listen();
    try {
      const pkce = pkcePair();
      const state = randomState();
      const link = new URL(this.deps.connectUrl);
      link.search = new URLSearchParams({
        return: listener.returnUrl,
        state,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        label: name,
        ...(before === null ? {} : { stores: before.keys.map((k) => k.storeId).join(',') }),
      }).toString();
      out(`Approve this computer in your browser: ${link.toString()}`);
      if (!(await this.deps.openBrowser(link.toString()))) out('The browser did not open by itself: open the address above.');
      const code = await listener.waitForCode(state, this.deps.timeoutMs);
      const connected = await this.deps.connect.exchangeApp({ code, codeVerifier: pkce.verifier });
      await this.deps.credentials.write(profile, { label: name, keys: connected.stores.map((s) => ({ storeId: s.storeId, storeName: s.storeName, apiKey: s.apiKey })) });
      // Only once the keys are saved; any failure before this reaches the browser as "failed" through close().
      listener.finish('connected');
      out(`Connected ${connected.stores.map((s) => `"${s.storeName}"`).join(', ')} as "${name}" (profile ${profile}).`);
      const failed = before === null ? [] : await revokeKeys(before.keys, this.deps.revoke, out);
      return failed.length === 0 ? 0 : 1;
    } finally {
      listener.close();
    }
  }
}
