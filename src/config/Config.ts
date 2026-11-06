import { McpConfigError } from './McpConfigError.js';
import { profileName } from './ProfileName.js';
import { serviceUrl } from './ServiceUrl.js';

const API_KEY = /^sk_(live|test)_[A-Za-z0-9_-]+$/;

export type KeySource = { readonly kind: 'key'; readonly apiKey: string } | { readonly kind: 'profile'; readonly profile: string };

/** Everything the server and the CLI read from the environment, once, at start (spec SPEC-mcp-server 3.2). */
export interface Config {
  readonly apiUrl: string;
  /** The dashboard page npx stablevoy-mcp login opens. */
  readonly connectUrl: string;
  /** The page of the site the browser lands on when the login has finished: done/ under connectUrl. */
  readonly loginDoneUrl: string;
  readonly readOnly: boolean;
  /** STABLEVOY_API_KEY when set, else the login profile. */
  readonly source: KeySource;
  readonly profile: string;
}

export function configFrom(env: Readonly<Record<string, string | undefined>>): Config {
  const readOnly = env['STABLEVOY_MCP_READ_ONLY'];
  if (readOnly !== undefined && readOnly !== '' && readOnly !== 'true' && readOnly !== 'false') throw new McpConfigError('STABLEVOY_MCP_READ_ONLY must be true or false');
  const profile = profileName(env['STABLEVOY_MCP_PROFILE']);
  const apiKey = env['STABLEVOY_API_KEY'];
  if (apiKey !== undefined && apiKey !== '' && !API_KEY.test(apiKey)) throw new McpConfigError('STABLEVOY_API_KEY must be a store API key (sk_live_... or sk_test_...)');
  const connectUrl = serviceUrl('STABLEVOY_CONNECT_URL', env['STABLEVOY_CONNECT_URL'], 'https://stablevoy.com/app/connect-app/', false);
  const connectPage = new URL(connectUrl);
  connectPage.search = '';
  if (!connectPage.pathname.endsWith('/')) connectPage.pathname += '/';
  return {
    apiUrl: serviceUrl('STABLEVOY_API_URL', env['STABLEVOY_API_URL'], 'https://api.stablevoy.com', true),
    connectUrl,
    loginDoneUrl: new URL('done/', connectPage).toString(),
    readOnly: readOnly === 'true',
    source: apiKey === undefined || apiKey === '' ? { kind: 'profile', profile } : { kind: 'key', apiKey },
    profile,
  };
}
