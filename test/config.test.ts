import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { configFrom } from '../src/config/Config.js';
import { profileName } from '../src/config/ProfileName.js';
import { configDir } from '../src/credentials/ConfigDir.js';
import { keyPrefix } from '../src/login/Output.js';

/** A well-formed checksummed key (CRC-32 of prefix and random part, as the API builds it). */
const SVK = 'svk_live_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1' + checksum('svk_live_aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1');

function checksum(text: string): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let n = crc32(text);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out = alphabet.charAt(n % 62) + out;
    n = Math.floor(n / 62);
  }
  return out;
}

describe('configuration from the environment', () => {
  it('defaults to production, the default profile and writing tools', () => {
    expect(configFrom({})).toEqual({
      apiUrl: 'https://api.stablevoy.com',
      siteUrl: 'https://stablevoy.com',
      connectUrl: 'https://stablevoy.com/app/connect-app/',
      loginDoneUrl: 'https://stablevoy.com/app/connect-app/done/',
      readOnly: false,
      source: { kind: 'profile', profile: 'default' },
      profile: 'default',
    });
  });

  it('takes a store key, a profile, read-only mode and local addresses for testing', () => {
    const config = configFrom({ STABLEVOY_API_KEY: 'sk_test_abc', STABLEVOY_MCP_PROFILE: 'work', STABLEVOY_MCP_READ_ONLY: 'true', STABLEVOY_API_URL: 'http://localhost:8080/', STABLEVOY_CONNECT_URL: 'http://127.0.0.1:3000/app/connect-app/', STABLEVOY_SITE_URL: 'http://localhost:3000/' });
    expect(config).toMatchObject({ apiUrl: 'http://localhost:8080', siteUrl: 'http://localhost:3000', connectUrl: 'http://127.0.0.1:3000/app/connect-app/', readOnly: true, source: { kind: 'key', apiKey: 'sk_test_abc' }, profile: 'work' });
    expect(configFrom({ STABLEVOY_MCP_READ_ONLY: 'false', STABLEVOY_API_KEY: '' }).readOnly).toBe(false);
    // The checksummed format (spec SPEC-key-prefixes) and the older one are both store keys.
    expect(configFrom({ STABLEVOY_API_KEY: SVK }).source).toEqual({ kind: 'key', apiKey: SVK });
    // The result page sits under the connect page, with or without its trailing slash or a query.
    expect(config.loginDoneUrl).toBe('http://127.0.0.1:3000/app/connect-app/done/');
    expect(configFrom({ STABLEVOY_CONNECT_URL: 'http://localhost:3000/app/connect-app?x=1' }).loginDoneUrl).toBe('http://localhost:3000/app/connect-app/done/');
  });

  it('refuses anything it cannot be sure of, loudly', () => {
    expect(() => configFrom({ STABLEVOY_API_KEY: 'pk_live_x' })).toThrow('STABLEVOY_API_KEY must be a store API key');
    expect(() => configFrom({ STABLEVOY_API_KEY: 'sk_live_a b' })).toThrow('STABLEVOY_API_KEY must be a store API key');
    expect(() => configFrom({ STABLEVOY_API_KEY: `${SVK}x` })).toThrow('STABLEVOY_API_KEY looks mistyped or cut');
    expect(() => configFrom({ STABLEVOY_API_KEY: SVK.slice(0, -1) })).toThrow('STABLEVOY_API_KEY looks mistyped or cut');
    expect(() => configFrom({ STABLEVOY_MCP_READ_ONLY: 'yes' })).toThrow('STABLEVOY_MCP_READ_ONLY must be true or false');
    expect(() => configFrom({ STABLEVOY_API_URL: 'http://api.stablevoy.com' })).toThrow('STABLEVOY_API_URL must use https');
    expect(() => configFrom({ STABLEVOY_API_URL: 'not a url' })).toThrow('STABLEVOY_API_URL is not a valid URL');
    expect(() => configFrom({ STABLEVOY_SITE_URL: 'http://stablevoy.com' })).toThrow('STABLEVOY_SITE_URL must use https');
    expect(() => configFrom({ STABLEVOY_MCP_PROFILE: '../etc' })).toThrow('Profile "../etc" must be');
    expect(profileName(undefined)).toBe('default');
  });

  it('keeps the keys in the config folder of each OS', () => {
    expect(configDir({}, 'linux', '/home/ann')).toBe('/home/ann/.config/stablevoy-mcp');
    expect(configDir({ XDG_CONFIG_HOME: '/cfg' }, 'linux', '/home/ann')).toBe('/cfg/stablevoy-mcp');
    expect(configDir({ XDG_CONFIG_HOME: '' }, 'freebsd', '/home/ann')).toBe('/home/ann/.config/stablevoy-mcp');
    expect(configDir({}, 'darwin', '/Users/ann')).toBe('/Users/ann/Library/Application Support/stablevoy-mcp');
    expect(configDir({ APPDATA: 'C:\\Users\\ann\\AppData\\Roaming' }, 'win32', 'C:\\Users\\ann')).toBe('C:\\Users\\ann\\AppData\\Roaming\\stablevoy-mcp');
    expect(configDir({}, 'win32', 'C:\\Users\\ann')).toBe('C:\\Users\\ann\\AppData\\Roaming\\stablevoy-mcp');
  });
});

describe('keyPrefix', () => {
  it('shows the prefix and 4 characters of either format, as the dashboard does', () => {
    expect(keyPrefix(SVK)).toBe(SVK.slice(0, 13));
    expect(keyPrefix('sk_live_4f9aXYZ')).toBe('sk_live_4f9a');
    expect(() => keyPrefix('pk_live_4f9a')).toThrow('Not a store API key');
  });
});
