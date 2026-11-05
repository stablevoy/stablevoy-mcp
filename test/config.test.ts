import { describe, expect, it } from 'vitest';
import { configFrom } from '../src/config/Config.js';
import { profileName } from '../src/config/ProfileName.js';
import { configDir } from '../src/credentials/ConfigDir.js';

describe('configuration from the environment', () => {
  it('defaults to production, the default profile and writing tools', () => {
    expect(configFrom({})).toEqual({
      apiUrl: 'https://api.stablevoy.com',
      connectUrl: 'https://stablevoy.com/app/connect-app/',
      readOnly: false,
      source: { kind: 'profile', profile: 'default' },
      profile: 'default',
    });
  });

  it('takes a store key, a profile, read-only mode and local addresses for testing', () => {
    const config = configFrom({ STABLEVOY_API_KEY: 'sk_test_abc', STABLEVOY_MCP_PROFILE: 'work', STABLEVOY_MCP_READ_ONLY: 'true', STABLEVOY_API_URL: 'http://localhost:8080/', STABLEVOY_CONNECT_URL: 'http://127.0.0.1:3000/app/connect-app/' });
    expect(config).toMatchObject({ apiUrl: 'http://localhost:8080', connectUrl: 'http://127.0.0.1:3000/app/connect-app/', readOnly: true, source: { kind: 'key', apiKey: 'sk_test_abc' }, profile: 'work' });
    expect(configFrom({ STABLEVOY_MCP_READ_ONLY: 'false', STABLEVOY_API_KEY: '' }).readOnly).toBe(false);
  });

  it('refuses anything it cannot be sure of, loudly', () => {
    expect(() => configFrom({ STABLEVOY_API_KEY: 'pk_live_x' })).toThrow('STABLEVOY_API_KEY must be a store API key');
    expect(() => configFrom({ STABLEVOY_MCP_READ_ONLY: 'yes' })).toThrow('STABLEVOY_MCP_READ_ONLY must be true or false');
    expect(() => configFrom({ STABLEVOY_API_URL: 'http://api.stablevoy.com' })).toThrow('STABLEVOY_API_URL must use https');
    expect(() => configFrom({ STABLEVOY_API_URL: 'not a url' })).toThrow('STABLEVOY_API_URL is not a valid URL');
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
