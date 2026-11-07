import { readFileSync } from 'node:fs';
import { DocsFetcher } from '../../src/docs/DocsFetcher.js';
import { DocsLibrary } from '../../src/docs/DocsLibrary.js';

export const SITE = 'https://stablevoy.com';
export const API = 'https://api.stablevoy.com';

const OPENAPI = readFileSync(new URL('../fixtures/openapi.json', import.meta.url), 'utf8');

export const LLMS_TXT = `# Stablevoy

> USDT and USDC to your own wallet.

## Docs

- [Webhooks](${SITE}/docs/webhooks.md): Signed payment events.
- [Connect an AI assistant](${SITE}/mcp.md): Log in and create a store.

## Optional

- [OpenAPI description](${API}/v1/openapi.json): every endpoint.
- [Elsewhere](https://example.com/evil.md): not ours.
`;

export const WEBHOOKS_MD = `# Webhooks

Stablevoy tells your server about every change of an invoice.

## Verify the signature

Check the X-Stablevoy-Signature header with HMAC SHA-256 of the raw body and your signing secret.

\`\`\`
# not a heading, a comment in code
\`\`\`

## Retries

A webhook that fails is retried for three days.

Source: ${SITE}/docs/webhooks/
`;

export const MCP_MD = `# Connect an AI assistant

## Log in

Run npx stablevoy-mcp login and create your first store on the connect page.

Source: ${SITE}/mcp/
`;

export const ERRORS_JSON = JSON.stringify({ groups: [{ key: 'invoices', title: 'Invoices', errors: [{ code: 'invalid_invoice_filter', status: 400, meaning: 'A filter is wrong.', action: 'Fix the dates.' }] }] });

/** Files of the fake site and API by address; a function answer can fail or count calls. */
export type SiteFiles = Record<string, string | (() => Response | Promise<Response>)>;

export function defaultFiles(): SiteFiles {
  return { [`${SITE}/llms.txt`]: LLMS_TXT, [`${SITE}/docs/webhooks.md`]: WEBHOOKS_MD, [`${SITE}/mcp.md`]: MCP_MD, [`${API}/v1/openapi.json`]: OPENAPI, [`${API}/v1/errors`]: ERRORS_JSON };
}

/** A DocsLibrary over a fetch that answers from `files` and records every address asked for. */
export function fakeDocs(files: SiteFiles = defaultFiles(), clock: { now: number } = { now: 0 }, limits: { timeoutMs?: number; maxBytes?: number } = {}): { docs: DocsLibrary; fetched: string[]; clock: { now: number } } {
  const fetched: string[] = [];
  const fetchFn = ((input: string | URL) => {
    const url = String(input);
    fetched.push(url);
    const file = files[url];
    if (file === undefined) return Promise.resolve(new Response('not found', { status: 404 }));
    return typeof file === 'function' ? Promise.resolve(file()) : Promise.resolve(new Response(file, { status: 200 }));
  }) as typeof fetch;
  const fetcher = new DocsFetcher({ fetch: fetchFn, now: () => clock.now, ...limits });
  return { docs: new DocsLibrary({ fetcher, siteUrl: SITE, apiUrl: API }), fetched, clock };
}
