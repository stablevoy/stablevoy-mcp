import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { StablevoyConnect } from 'stablevoy';
import { parseArguments, USAGE } from '../src/cli/Arguments.js';
import { Cli, type CliDeps } from '../src/cli/Cli.js';
import { configFrom } from '../src/config/Config.js';
import { CredentialStore } from '../src/credentials/CredentialStore.js';
import { LoginCommand } from '../src/login/LoginCommand.js';
import { LogoutCommand } from '../src/login/LogoutCommand.js';
import { LoopbackListener } from '../src/login/LoopbackListener.js';
import { StoresCommand } from '../src/login/StoresCommand.js';
import { fakeStablevoy } from './support/FakeApi.js';
import { connectClient } from './support/McpHarness.js';
import { example } from './support/openApi.js';

describe('command line', () => {
  it('reads every command and refuses anything unknown', () => {
    expect(parseArguments([])).toEqual({ kind: 'serve' });
    expect(parseArguments(['login', '--name', 'laptop', '--profile', 'work'])).toEqual({ kind: 'login', profile: 'work', name: 'laptop' });
    expect(parseArguments(['logout'])).toEqual({ kind: 'logout', profile: null });
    expect(parseArguments(['stores', '--profile', 'work'])).toEqual({ kind: 'stores', profile: 'work' });
    expect(parseArguments(['stores', 'remove', 'Main'])).toEqual({ kind: 'stores-remove', profile: null, store: 'Main' });
    expect(parseArguments(['--help'])).toEqual({ kind: 'help' });
    expect(() => parseArguments(['login', '--name'])).toThrow('--name needs a value');
    expect(() => parseArguments(['login', '--name', '--profile'])).toThrow('--name needs a value');
    expect(() => parseArguments(['--verbose'])).toThrow('Unknown option --verbose');
    expect(() => parseArguments(['logout', '--name', 'x'])).toThrow('--name is only for login');
    expect(() => parseArguments(['--profile', 'work'])).toThrow('STABLEVOY_MCP_PROFILE');
    expect(() => parseArguments(['stores', 'remove'])).toThrow('Unknown command "stores remove"');
    expect(() => parseArguments(['revoke'])).toThrow('Unknown command "revoke"');
    expect(() => parseArguments(['stores', '--profile', 'BAD'])).toThrow('Profile "BAD"');
  });
});

describe('the CLI', () => {
  let credentials: CredentialStore;
  let lines: string[];
  let served: McpServer[];
  let calls: string[];

  const deps = (env: Record<string, string> = {}): CliDeps => {
    const config = configFrom(env);
    const out = (line: string) => void lines.push(line);
    const revoke = () => Promise.resolve();
    const stores = new StoresCommand({ credentials, revoke, out });
    const login = new LoginCommand({ credentials, connect: StablevoyConnect.create(), revoke, listen: () => LoopbackListener.start(config.loginDoneUrl), openBrowser: () => Promise.resolve(true), connectUrl: config.connectUrl, out, timeoutMs: 10 });
    return {
      config,
      version: '0.1.0',
      hostname: 'h'.repeat(50),
      credentials,
      login: Object.assign(login, { run: (profile: string, name: string) => Promise.resolve((calls.push(`login ${profile} ${name}`), 0)) }),
      logout: Object.assign(new LogoutCommand({ credentials, revoke, out }), { run: (profile: string) => Promise.resolve((calls.push(`logout ${profile}`), 0)) }),
      stores: Object.assign(stores, { list: (profile: string) => Promise.resolve((calls.push(`stores ${profile}`), 0)), remove: (profile: string, store: string) => Promise.resolve((calls.push(`remove ${profile} ${store}`), 0)) }),
      sdkFor: (apiKey) => fakeStablevoy({ 'GET /v1/store': () => ({ status: 200, body: { ...example('GET', '/v1/store', 200), id: apiKey, name: `Store ${apiKey}` } }) }, apiKey).api,
      serve: (server) => {
        served.push(server);
        return Promise.resolve();
      },
      out,
    };
  };

  beforeEach(async () => {
    credentials = new CredentialStore(await mkdtemp(path.join(tmpdir(), 'svmcp-cli-')));
    lines = [];
    served = [];
    calls = [];
  });

  it('runs each command on the profile of the environment or of --profile, the computer name defaulting to the host', async () => {
    const cli = new Cli(deps({ STABLEVOY_MCP_PROFILE: 'work' }));
    expect(await cli.run(['login'])).toBe(0);
    expect(await cli.run(['login', '--name', 'laptop', '--profile', 'home'])).toBe(0);
    expect(await cli.run(['logout'])).toBe(0);
    expect(await cli.run(['stores'])).toBe(0);
    expect(await cli.run(['stores', 'remove', 'Main'])).toBe(0);
    expect(calls).toEqual([`login work ${'h'.repeat(40)}`, 'login home laptop', 'logout work', 'stores work', 'remove work Main']);
    expect(await cli.run(['--help'])).toBe(0);
    expect(lines.pop()).toBe(USAGE);
    expect(await cli.run(['nope'])).toBe(1);
    expect(lines.pop()).toContain('Unknown command "nope"');
  });

  it('serves the stores of STABLEVOY_API_KEY, or of the login profile, and says how to connect when there is neither', async () => {
    expect(await new Cli(deps()).run([])).toBe(1);
    expect(lines.pop()).toBe('No Stablevoy key: run npx stablevoy-mcp login, or set STABLEVOY_API_KEY in the MCP client config.');

    expect(await new Cli(deps({ STABLEVOY_API_KEY: 'sk_live_env' })).run([])).toBe(0);
    const single = await connectClient(served[0] as McpServer);
    expect((await single.call('list_stores')).structuredContent).toMatchObject({ stores: [{ name: 'Store sk_live_env' }] });

    await credentials.write('default', { label: 'laptop', keys: [{ storeId: 's1', storeName: 'Main', apiKey: 'sk_live_1' }, { storeId: 's2', storeName: 'Second', apiKey: 'sk_live_2' }] });
    expect(await new Cli(deps({ STABLEVOY_MCP_READ_ONLY: 'true' })).run([])).toBe(0);
    const several = await connectClient(served[1] as McpServer);
    expect((await several.client.listTools()).tools.map((t) => t.name)).not.toContain('create_invoice');
    expect((await several.call('list_stores')).structuredContent).toMatchObject({ stores: [{ name: 'Store sk_live_1' }, { name: 'Store sk_live_2' }] });
  });

  it('passes on a failure that is not a setup problem', async () => {
    const broken = { ...deps(), serve: async () => Promise.reject(new Error('transport broke')) };
    await expect(new Cli({ ...broken, config: configFrom({ STABLEVOY_API_KEY: 'sk_live_x' }) }).run([])).rejects.toThrow('transport broke');
  });
});
