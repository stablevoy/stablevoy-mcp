import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { StablevoyConnect, TransportError } from 'stablevoy';
import { CredentialStore } from '../src/credentials/CredentialStore.js';
import { systemBrowserOpener, type Spawn } from '../src/login/BrowserOpener.js';
import { sdkKeyRevoker, type KeyRevoker } from '../src/login/KeyRevoker.js';
import { LoginCommand } from '../src/login/LoginCommand.js';
import { LoginTimeout } from '../src/login/LoginTimeout.js';
import { LogoutCommand } from '../src/login/LogoutCommand.js';
import { LoopbackListener } from '../src/login/LoopbackListener.js';
import { pkcePair, randomState } from '../src/login/Pkce.js';
import { StoresCommand } from '../src/login/StoresCommand.js';
import { problem } from './support/FakeApi.js';

const CONNECT = 'https://stablevoy.com/app/connect-app/';

function exchangeWith(stores: { id: string; name: string; apiKey: string }[], seen: unknown[] = []): StablevoyConnect {
  const fetchFn = ((_url: string, init?: RequestInit) => {
    seen.push(JSON.parse(init?.body as string) as unknown);
    return Promise.resolve(new Response(JSON.stringify({ stores }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return StablevoyConnect.create({ fetch: fetchFn });
}

/** A browser that follows the approval: the dashboard would redirect it to the loopback address with a code. */
function browser(opened: URL[], answer: (link: URL) => Promise<void> | void = async (link) => {
  await fetch(`${link.searchParams.get('return') ?? ''}?stablevoy_code=${'k'.repeat(43)}&state=${link.searchParams.get('state') ?? ''}`);
}) {
  return (url: string) => {
    const link = new URL(url);
    opened.push(link);
    setTimeout(() => void answer(link), 0);
    return Promise.resolve(true);
  };
}

describe('npx stablevoy-mcp login (spec SPEC-mcp-server 10.2)', () => {
  let credentials: CredentialStore;
  let lines: string[];
  let revoked: string[];
  const revoke: KeyRevoker = (key) => {
    revoked.push(key);
    return Promise.resolve();
  };
  const out = (line: string) => void lines.push(line);
  const login = (connect: StablevoyConnect, openBrowser: (url: string) => Promise<boolean>, revoker: KeyRevoker = revoke, timeoutMs = 5000) =>
    new LoginCommand({ credentials, connect, revoke: revoker, listen: () => LoopbackListener.start(), openBrowser, connectUrl: CONNECT, out, timeoutMs });

  beforeEach(async () => {
    credentials = new CredentialStore(await mkdtemp(path.join(tmpdir(), 'svmcp-login-')));
    lines = [];
    revoked = [];
  });

  it('opens the approval page with PKCE and the loopback address, and saves one key per approved store', async () => {
    const opened: URL[] = [];
    const seen: unknown[] = [];
    const code = await login(exchangeWith([{ id: 's1', name: 'Main', apiKey: 'sk_live_a' }, { id: 's2', name: 'Second', apiKey: 'sk_live_b' }], seen), browser(opened)).run('default', 'work laptop');
    expect(code).toBe(0);
    const link = opened[0] as URL;
    expect(`${link.origin}${link.pathname}`).toBe(CONNECT);
    expect(link.searchParams.get('return')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect([link.searchParams.get('code_challenge_method'), link.searchParams.get('label'), link.searchParams.get('stores')]).toEqual(['S256', 'work laptop', null]);
    expect(seen).toEqual([{ code: 'k'.repeat(43), codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown }]);
    expect(await credentials.read('default')).toEqual({ label: 'work laptop', keys: [{ storeId: 's1', storeName: 'Main', apiKey: 'sk_live_a' }, { storeId: 's2', storeName: 'Second', apiKey: 'sk_live_b' }] });
    expect(lines.at(-1)).toBe('Connected "Main", "Second" as "work laptop" (profile default).');
    expect(lines.join('\n')).not.toContain('sk_live_a');
  });

  it('a later login ticks the stores it holds, then revokes every old key once the new ones are saved', async () => {
    await credentials.write('default', { label: 'old', keys: [{ storeId: 's1', storeName: 'Main', apiKey: 'sk_live_old1' }, { storeId: 's3', storeName: 'Third', apiKey: 'sk_live_old3' }] });
    const opened: URL[] = [];
    expect(await login(exchangeWith([{ id: 's1', name: 'Main', apiKey: 'sk_live_new1' }]), browser(opened)).run('default', 'laptop')).toBe(0);
    expect(opened[0]?.searchParams.get('stores')).toBe('s1,s3');
    expect(revoked).toEqual(['sk_live_old1', 'sk_live_old3']);
    expect((await credentials.read('default'))?.keys.map((k) => k.apiKey)).toEqual(['sk_live_new1']);
  });

  it('says loudly which old key it could not revoke, and keeps the new ones', async () => {
    await credentials.write('default', { label: 'old', keys: [{ storeId: 's3', storeName: 'Third', apiKey: 'sk_live_old3xyz' }] });
    const failing: KeyRevoker = () => Promise.reject(new TransportError('Cannot reach the Stablevoy API'));
    expect(await login(exchangeWith([{ id: 's1', name: 'Main', apiKey: 'sk_live_new1' }]), browser([]), failing).run('default', 'laptop')).toBe(1);
    expect(lines.at(-1)).toBe('Could not revoke the key sk_live_old3... of store "Third": TransportError: Cannot reach the Stablevoy API Revoke it on the store page of the Stablevoy dashboard.');
    expect((await credentials.read('default'))?.keys.map((k) => k.apiKey)).toEqual(['sk_live_new1']);
  });

  it('ignores a request with another state or path, prints the address when no browser opens, and gives up after the timeout', async () => {
    const answers: number[] = [];
    const tricky = browser([], async (link) => {
      const back = link.searchParams.get('return') ?? '';
      answers.push((await fetch(`${back}?stablevoy_code=x&state=forged`)).status, (await fetch(back.replace('/callback', '/other'))).status, (await fetch(`${back}?state=${link.searchParams.get('state') ?? ''}`)).status);
    });
    const failed = login(exchangeWith([]), async (url) => (await tricky(url), false), revoke, 300);
    await expect(failed.run('default', 'laptop')).rejects.toBeInstanceOf(LoginTimeout);
    expect(answers).toEqual([400, 404, 400]);
    expect(lines).toContain('The browser did not open by itself: open the address above.');
    expect(await credentials.read('default')).toBeNull();
  });

  it('refuses a computer name the dashboard would refuse', async () => {
    expect(await login(exchangeWith([]), browser([])).run('default', '   ')).toBe(1);
    expect(await login(exchangeWith([]), browser([])).run('default', 'x'.repeat(41))).toBe(1);
    expect(lines).toEqual(['The computer name (--name) must be 1 to 40 plain characters.', 'The computer name (--name) must be 1 to 40 plain characters.']);
  });
});

describe('logout and stores', () => {
  let credentials: CredentialStore;
  let lines: string[];
  let revoked: string[];
  const out = (line: string) => void lines.push(line);
  const keys = [
    { storeId: 's1', storeName: 'Main', apiKey: 'sk_live_a' },
    { storeId: 's2', storeName: 'Second', apiKey: 'sk_live_b' },
  ];

  beforeEach(async () => {
    credentials = new CredentialStore(await mkdtemp(path.join(tmpdir(), 'svmcp-out-')));
    lines = [];
    revoked = [];
  });

  it('logout revokes every key and removes the profile, or keeps the keys it could not revoke', async () => {
    const revoke: KeyRevoker = (key) => {
    revoked.push(key);
    return Promise.resolve();
  };
    expect(await new LogoutCommand({ credentials, revoke, out }).run('default')).toBe(0);
    expect(lines).toEqual(['Profile default holds no keys.']);
    await credentials.write('default', { label: 'laptop', keys });
    expect(await new LogoutCommand({ credentials, revoke, out }).run('default')).toBe(0);
    expect([revoked, await credentials.read('default')]).toEqual([['sk_live_a', 'sk_live_b'], null]);
    await credentials.write('default', { label: 'laptop', keys });
    const half: KeyRevoker = (key) => (key === 'sk_live_b' ? Promise.reject(new TransportError('down')) : Promise.resolve());
    expect(await new LogoutCommand({ credentials, revoke: half, out }).run('default')).toBe(1);
    expect((await credentials.read('default'))?.keys.map((k) => k.storeId)).toEqual(['s2']);
  });

  it('stores lists the profile and removes one store by name or id', async () => {
    const revoke: KeyRevoker = (key) => {
    revoked.push(key);
    return Promise.resolve();
  };
    const stores = new StoresCommand({ credentials, revoke, out });
    expect(await stores.list('default')).toBe(0);
    expect(lines.pop()).toBe('Profile default holds no keys. Run npx stablevoy-mcp login.');
    await credentials.write('default', { label: 'laptop', keys });
    await stores.list('default');
    expect(lines.splice(0)).toEqual(['Profile default ("laptop"):', '  "Main"  s1  sk_live_a...', '  "Second"  s2  sk_live_b...']);
    expect(await stores.remove('default', 'Nope')).toBe(1);
    expect(lines.pop()).toBe('Profile default has no store "Nope". See npx stablevoy-mcp stores.');
    expect(await stores.remove('default', 'Main')).toBe(0);
    expect([revoked, (await credentials.read('default'))?.keys.map((k) => k.storeId)]).toEqual([['sk_live_a'], ['s2']]);
    expect(await stores.remove('default', 's2')).toBe(0);
    expect(await credentials.read('default')).toBeNull();
    expect(await stores.remove('default', 's2')).toBe(1);
  });

  it('stores remove asks for the id when two stores share a name, and keeps a key it could not revoke', async () => {
    await credentials.write('default', { label: 'laptop', keys: [{ storeId: 's1', storeName: 'Shop', apiKey: 'sk_live_a' }, { storeId: 's2', storeName: 'Shop', apiKey: 'sk_live_b' }] });
    const failing: KeyRevoker = () => Promise.reject(new TransportError('down'));
    const stores = new StoresCommand({ credentials, revoke: failing, out });
    expect(await stores.remove('default', 'Shop')).toBe(1);
    expect(lines.pop()).toBe('Several stores are named "Shop": pass the store id.');
    expect(await stores.remove('default', 's1')).toBe(1);
    expect((await credentials.read('default'))?.keys).toHaveLength(2);
  });
});

describe('login helpers', () => {
  it('makes an S256 pair and a state from random bytes', () => {
    const pair = pkcePair(() => Buffer.alloc(32, 1));
    expect(pair).toEqual({ verifier: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE', challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown });
    expect(randomState(() => Buffer.alloc(16, 2))).toBe('AgICAgICAgICAgICAgICAg');
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier);
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('opens the browser with the command of each OS and no shell, and reports a missing command', async () => {
    const calls: [string, readonly string[]][] = [];
    const spawn = (event: 'spawn' | 'error'): Spawn => (command, args) => {
      calls.push([command, args]);
      const child = Object.assign(new EventEmitter(), { unref: () => undefined });
      setTimeout(() => child.emit(event), 0);
      return child;
    };
    expect(await systemBrowserOpener('linux', spawn('spawn'))('https://x.example/?a=1&b=2')).toBe(true);
    expect(await systemBrowserOpener('darwin', spawn('spawn'))('https://x.example/')).toBe(true);
    expect(await systemBrowserOpener('win32', spawn('error'))('https://x.example/?a=1&b=2')).toBe(false);
    expect(calls).toEqual([
      ['xdg-open', ['https://x.example/?a=1&b=2']],
      ['open', ['https://x.example/']],
      ['rundll32', ['url.dll,FileProtocolHandler', 'https://x.example/?a=1&b=2']],
    ]);
  });

  it('revokes a key with the key itself, and counts an already refused key as revoked', async () => {
    const seen: { url: string; method: string | undefined; auth: string | null }[] = [];
    const fetchWith = (status: number, body?: unknown) =>
      ((url: string, init?: RequestInit) => {
        seen.push({ url, method: init?.method, auth: new Headers(init?.headers).get('authorization') });
        return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
      }) as typeof fetch;
    await sdkKeyRevoker({ fetch: fetchWith(204) })('sk_live_a');
    expect(seen[0]).toEqual({ url: 'https://api.stablevoy.com/v1/store/api-keys/current', method: 'DELETE', auth: 'Bearer sk_live_a' });
    await sdkKeyRevoker({ fetch: fetchWith(401, problem(401, 'authentication_failed', 'Invalid API key')) })('sk_live_b');
    await expect(sdkKeyRevoker({ fetch: fetchWith(400, problem(400, 'bad_request', 'No')), sleep: () => Promise.resolve() })('sk_live_c')).rejects.toMatchObject({ code: 'bad_request' });
  });
});
