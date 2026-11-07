import { describe, expect, it } from 'vitest';
import { DOCS_CACHE_MS, DocsFetcher } from '../src/docs/DocsFetcher.js';
import { MAX_DOC_PAGES } from '../src/docs/DocsLibrary.js';
import { errorCatalogText } from '../src/docs/ErrorCatalogText.js';
import { parseLlmsTxt } from '../src/docs/LlmsIndex.js';
import { sectionsOf } from '../src/docs/MarkdownSections.js';
import { openApiOutline } from '../src/docs/OpenApiOutline.js';
import { MAX_SECTION_CHARS, searchSections, termsOf } from '../src/docs/SectionSearch.js';
import { createServer } from '../src/server/ServerFactory.js';
import { toolsFor } from '../src/server/toolsFor.js';
import { docsToolError } from '../src/tools/DocsToolError.js';
import { API, defaultFiles, fakeDocs, LLMS_TXT, SITE, WEBHOOKS_MD } from './support/FakeSite.js';
import { connectClient, textOf } from './support/McpHarness.js';

describe('llms.txt and Markdown sections', () => {
  it('reads the listed pages with their section, and ignores other lines', () => {
    const entries = parseLlmsTxt(LLMS_TXT);
    expect(entries[0]).toEqual({ section: 'Docs', title: 'Webhooks', url: `${SITE}/docs/webhooks.md`, description: 'Signed payment events.' });
    expect(entries.map((e) => e.section)).toEqual(['Docs', 'Docs', 'Optional', 'Optional']);
  });

  it('splits a page at its headings, a # inside code staying text, and drops empty sections', () => {
    const sections = sectionsOf(WEBHOOKS_MD);
    expect(sections.map((s) => s.heading)).toEqual(['Webhooks', 'Verify the signature', 'Retries']);
    expect(sections[1]?.text).toContain('# not a heading');
    expect(sectionsOf('# Only a title\n\n## Empty\n')).toEqual([]);
  });
});

describe('search', () => {
  const page = { title: 'Webhooks', path: '/docs/webhooks.md', url: `${SITE}/docs/webhooks/`, sections: sectionsOf(WEBHOOKS_MD) };

  it('keeps the words that can match', () => {
    expect(termsOf('How do I verify the Webhook signature? a')).toEqual(['verify', 'webhook', 'signature']);
  });

  it('ranks the section with the most words first and finds nothing for unknown words', () => {
    const hits = searchSections([page], 'verify signature retries');
    expect(hits[0]).toMatchObject({ page: 'Webhooks', path: '/docs/webhooks.md', url: `${SITE}/docs/webhooks/`, heading: 'Verify the signature' });
    expect(hits.map((h) => h.heading)).toContain('Retries');
    expect(searchSections([page], 'solana')).toEqual([]);
    expect(searchSections([page], 'the and')).toEqual([]);
  });

  it('cuts a long section at a paragraph, or hard when it has none, and says get_doc has the rest', () => {
    const long = { ...page, sections: [{ heading: 'Long', text: `${'word '.repeat(300)}\n\n${'more '.repeat(300)}` }, { heading: 'Flat', text: 'flat '.repeat(600) }] };
    const [paragraph, flat] = [searchSections([long], 'word')[0], searchSections([long], 'flat')[0]];
    expect(paragraph?.text.endsWith('(cut here: get_doc has the whole page)')).toBe(true);
    expect(paragraph?.text).not.toContain('more');
    expect(flat?.text.length).toBeLessThan(MAX_SECTION_CHARS + 60);
  });
});

describe('the docs fetcher', () => {
  const answer = (body: string, init: ResponseInit = {}) => () => new Response(body, init);

  it('keeps a file for an hour and fetches it again after', async () => {
    const { docs, fetched, clock } = fakeDocs();
    await docs.pages();
    await docs.pages();
    expect(fetched).toEqual([`${SITE}/llms.txt`]);
    clock.now = DOCS_CACHE_MS;
    await docs.pages();
    expect(fetched).toHaveLength(2);
  });

  it('fails loudly with the address on an error status, a dead site, a timeout or a file too large', async () => {
    const url = `${SITE}/llms.txt`;
    await expect(fakeDocs({ [url]: answer('down', { status: 503 }) }).docs.pages()).rejects.toThrow(`${url} answered HTTP 503.`);
    const fetcher = (fn: () => Promise<Response>) => new DocsFetcher({ fetch: fn, now: () => 0, timeoutMs: 10_000, maxBytes: 10 });
    await expect(fetcher(() => Promise.reject(new TypeError('fetch failed'))).text(url)).rejects.toThrow(`${url} cannot be reached; try again later.`);
    await expect(fetcher(() => Promise.reject(new DOMException('slow', 'TimeoutError'))).text(url)).rejects.toThrow(`${url} no answer in 10 seconds; try again later.`);
    await expect(fetcher(() => Promise.resolve(new Response('x', { headers: { 'content-length': '11' } }))).text(url)).rejects.toThrow('is larger than 10 bytes');
    await expect(fetcher(() => Promise.resolve(new Response('0123456789A'))).text(url)).rejects.toThrow('is larger than 10 bytes');
    expect(await fetcher(() => Promise.resolve(new Response('fits'))).text(url)).toBe('fits');
  });

  it('never follows a redirect and stops waiting after the timeout', async () => {
    let init: RequestInit | undefined;
    const fetcher = new DocsFetcher({ fetch: ((_: string, given?: RequestInit) => ((init = given), Promise.resolve(new Response('ok')))) as typeof fetch, now: () => 0 });
    await fetcher.text(`${SITE}/llms.txt`);
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('the docs library', () => {
  it('offers only the Markdown pages of the site, never another address', async () => {
    const pages = await fakeDocs().docs.pages();
    expect(pages).toEqual([
      { path: '/docs/webhooks.md', url: `${SITE}/docs/webhooks/`, title: 'Webhooks', description: 'Signed payment events.' },
      { path: '/mcp.md', url: `${SITE}/mcp/`, title: 'Connect an AI assistant', description: 'Log in and create a store.' },
    ]);
  });

  it('reads a page by any spelling of its address, and refuses the rest with the list', async () => {
    const { docs, fetched } = fakeDocs();
    for (const path of ['/docs/webhooks.md', '/docs/webhooks/', 'docs/webhooks', `${SITE}/docs/webhooks/#retries`, `${SITE}/docs/webhooks.md`]) {
      expect((await docs.read(path)).text).toBe(WEBHOOKS_MD);
    }
    await expect(docs.read('https://example.com/evil.md')).rejects.toThrow('"https://example.com/evil.md" is not a Stablevoy docs page. Pass one of: /docs/webhooks.md, /mcp.md, openapi, errors.');
    await expect(docs.read('/../../etc/passwd')).rejects.toThrow('is not a Stablevoy docs page');
    expect(fetched.every((url) => url.startsWith(`${SITE}/`))).toBe(true);
  });

  it('outlines the API operations and lists the error codes', async () => {
    const { docs } = fakeDocs();
    const outline = await docs.read('openapi');
    expect(outline.text).toContain('## GET /v1/invoices/summary');
    expect(outline.text).toContain(`Base URL: ${API}.`);
    expect(outline.text).toMatch(/- query parameter `period`: /);
    expect(outline.text).toMatch(/- body field `amountUsdCents` \(required\)/);
    expect(outline.text).toMatch(/Auth: \S+/);
    expect((await docs.read('errors')).text).toContain('- `invalid_invoice_filter` (HTTP 400): A filter is wrong. What to do: Fix the dates.');
  });

  it('refuses an index without pages or with too many, and answers that are not what they should be', async () => {
    const files = defaultFiles();
    await expect(fakeDocs({ ...files, [`${SITE}/llms.txt`]: '# Nothing\n' }).docs.pages()).rejects.toThrow('lists no pages.');
    const many = Array.from({ length: MAX_DOC_PAGES + 1 }, (_, i) => `- [P${i}](${SITE}/p${i}.md): page.`).join('\n');
    await expect(fakeDocs({ ...files, [`${SITE}/llms.txt`]: many }).docs.pages()).rejects.toThrow(`more than ${MAX_DOC_PAGES}`);
    await expect(fakeDocs({ ...files, [`${API}/v1/openapi.json`]: 'not json' }).docs.read('openapi')).rejects.toThrow('did not answer with JSON.');
    await expect(fakeDocs({ ...files, [`${API}/v1/openapi.json`]: '[]' }).docs.read('openapi')).rejects.toThrow('is not an OpenAPI document.');
    await expect(fakeDocs({ ...files, [`${API}/v1/errors`]: '{}' }).docs.read('errors')).rejects.toThrow('is not the error catalog.');
  });

  it('outlines operations with and without security, parameters and body, and a body by reference', () => {
    const doc = {
      paths: {
        '/a': { get: { security: [] }, post: { summary: 'Make', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Body' } } } } } },
        '/b': { get: { parameters: [{ in: 'path', name: 'id' }, 'junk'], security: [{ storeKey: [] }, 'junk'] }, trace: {} },
      },
      components: { schemas: { Body: { properties: { name: {} } } } },
    };
    const text = openApiOutline(doc, 'u', 'https://api.example');
    expect(text).toContain('## GET /a\n\nAuth: none');
    expect(text).toContain('## POST /a\n\nMake\n\nAuth: none\n- body field `name`');
    expect(text).toContain('## GET /b\n\nAuth: storeKey\n- path parameter `id`');
    expect(openApiOutline({ paths: {} }, 'u', 'a')).toContain('# Stablevoy API operations');
    expect(errorCatalogText({ groups: [{ title: 'Empty' }] }, 'u')).toContain('## Empty');
  });
});

describe('the docs tools', () => {
  async function docsServer(files = defaultFiles()) {
    return connectClient(createServer('stablevoy-mcp', '0.3.0', toolsFor(null, false, fakeDocs(files).docs), false));
  }

  it('search the pages and read one, and say when nothing matched', async () => {
    const { call } = await docsServer();
    const found = await call('search_docs', { query: 'webhook retries' });
    expect(textOf(found)).toMatch(/^\d sections? for "webhook retries"\./);
    expect((found.structuredContent as { sections: unknown[] }).sections[0]).toMatchObject({ page: 'Webhooks', path: '/docs/webhooks.md', heading: 'Retries' });
    expect(textOf(await call('search_docs', { query: 'solana' }))).toMatch(/^No section matches "solana"/);
    expect(textOf(await call('get_doc', { path: '/docs/webhooks.md' }))).toContain('## Verify the signature');
  });

  it('give a tool error with the address when the site fails, and the list for an unknown page', async () => {
    const { call } = await docsServer({ ...defaultFiles(), [`${SITE}/llms.txt`]: () => new Response('down', { status: 502 }) });
    const failed = await call('search_docs', { query: 'webhook' });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toBe(`docs_unavailable: ${SITE}/llms.txt answered HTTP 502.`);
    expect(textOf(await call('get_doc', { path: '/docs/webhooks.md' }))).toMatch(/^docs_unavailable: /);
    const unknown = await (await docsServer()).call('get_doc', { path: '/secret' });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toMatch(/^unknown_doc: "\/secret" is not a Stablevoy docs page\./);
  });

  it('throw on anything that is not a docs failure', () => {
    expect(() => docsToolError(new Error('bug'))).toThrow('bug');
  });
});
