import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server/ServerFactory.js';
import { NOT_SIGNED_IN_ERROR } from '../src/server/SignInNotice.js';
import { toolsFor } from '../src/server/toolsFor.js';
import { DocsResources } from '../src/resources/DocsResources.js';
import { argText } from '../src/prompts/PromptText.js';
import { StoreClient } from '../src/stores/StoreClient.js';
import { StoreClients } from '../src/stores/StoreClients.js';
import { SignedOutStores } from '../src/stores/SignedOutStores.js';
import { NotSignedInError } from '../src/stores/NotSignedInError.js';
import { fakeStablevoy } from './support/FakeApi.js';
import { defaultFiles, fakeDocs, LLMS_TXT, SITE } from './support/FakeSite.js';
import { connectClient, partsWith, textOf } from './support/McpHarness.js';

async function keyed(readOnly = false) {
  const { api, sent } = fakeStablevoy({});
  const stores = new StoreClients([new StoreClient(api, { id: 's1', name: 'Main' })]);
  const { client, call } = await connectClient(createServer('stablevoy-mcp', '0.4.0', partsWith(toolsFor(stores, readOnly, fakeDocs().docs), true), true));
  return { client, call, sent };
}

async function keyless(readOnly = false, docs = fakeDocs().docs) {
  return connectClient(createServer('stablevoy-mcp', '0.4.0', partsWith(toolsFor(null, readOnly, docs), false, docs), false));
}

const promptText = async (client: Awaited<ReturnType<typeof keyed>>['client'], name: string, args: Record<string, string> = {}) => {
  const result = await client.getPrompt({ name, arguments: args });
  const [message] = result.messages;
  return message?.content.type === 'text' ? message.content.text : '';
};

describe('prompt arguments', () => {
  it('take a checked string or nothing, and fail loudly on anything else', () => {
    expect(argText({ store: 'Main' }, 'store')).toBe('Main');
    expect(argText({}, 'store')).toBeUndefined();
    expect(() => argText({ store: 7 }, 'store')).toThrow('Prompt argument store is not a string');
  });
});

describe('keyless server (spec SPEC-mcp-prompts-resources 2)', () => {
  it('lists every tool, and each store tool answers not_signed_in without calling the API', async () => {
    const { client, call } = await keyless();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(10);
    for (const name of ['list_stores', 'get_store', 'get_invoice', 'list_invoices', 'summarize_payments', 'list_unmatched_transfers', 'create_invoice', 'cancel_invoice']) {
      const result = await call(name, name === 'get_invoice' || name === 'cancel_invoice' ? { invoiceId: '00000000-0000-4000-8000-000000000000' } : name === 'create_invoice' ? { amountUsd: '10' } : {});
      expect(result.isError, name).toBe(true);
      expect(textOf(result), name).toBe(NOT_SIGNED_IN_ERROR);
    }
  });

  it('keeps the write tools out in read-only mode, with or without a key', async () => {
    for (const { client } of [await keyless(true), await keyed(true)]) {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain('create_invoice');
      expect(names).not.toContain('cancel_invoice');
      expect(names).toHaveLength(8);
    }
  });

  it('fails loudly if anything reaches the store directory without a key', async () => {
    const stores = new SignedOutStores();
    expect(() => stores.all).toThrow(NotSignedInError);
    expect(() => stores.several).toThrow(NotSignedInError);
    await expect(stores.targets()).rejects.toThrow(NOT_SIGNED_IN_ERROR);
    await expect(stores.resolve()).rejects.toThrow(NOT_SIGNED_IN_ERROR);
  });

  it('says in every tool description whether a key is needed, right after the first sentence', async () => {
    const { client } = await keyed();
    for (const tool of (await client.listTools()).tools) {
      const second = (tool.description ?? '').split('. ')[1];
      expect(second, tool.name).toMatch(tool.name === 'search_docs' || tool.name === 'get_doc' ? /^Needs no key/ : /^Needs a store key \(npx stablevoy-mcp login\)/);
    }
  });
});

describe('prompts (spec SPEC-mcp-prompts-resources 5)', () => {
  it('lists the five prompts in every mode', async () => {
    for (const { client } of [await keyed(), await keyed(true), await keyless(), await keyless(true)]) {
      expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(['payments_summary', 'unpaid_invoices', 'client_payments', 'review_unmatched_transfers', 'getting_started']);
    }
  });

  it('turns each prompt into the tool calls it needs, with the store when one is given', async () => {
    const { client, sent } = await keyed();
    const summary = await promptText(client, 'payments_summary', { period: 'last_month', store: 'Main' });
    expect(summary).toContain('Call summarize_payments with period "last_month" with store "Main"');
    expect(summary).toContain('the change against the previous period');
    expect(await promptText(client, 'unpaid_invoices')).toMatch(/list_invoices with status "awaiting_payment" and limit 100\..*checkoutUrl/s);
    const order = await promptText(client, 'client_payments', { reference: 'order-42' });
    expect(order).toContain('list_invoices with search "order-42"');
    expect(order).toContain('get_invoice');
    const unmatched = await promptText(client, 'review_unmatched_transfers', { store: 'Main' });
    expect(unmatched).toContain('list_unmatched_transfers with store "Main"');
    expect(unmatched).toContain('the tools cannot assign a transfer');
    for (const name of ['payments_summary', 'unpaid_invoices', 'client_payments', 'review_unmatched_transfers']) {
      const args: Record<string, string> = name === 'payments_summary' ? { period: 'last_7_days' } : name === 'client_payments' ? { reference: 'x' } : {};
      expect(await promptText(client, name, args), name).toContain('do not create or cancel anything');
    }
    expect(sent).toEqual([]);
  });

  it('refuses an argument outside the allowed values, and a missing required one, never guessing', async () => {
    const { client } = await keyed();
    await expect(client.getPrompt({ name: 'payments_summary', arguments: { period: 'last_year' } })).rejects.toThrow(/last_7_days/);
    await expect(client.getPrompt({ name: 'payments_summary', arguments: {} })).rejects.toThrow();
    await expect(client.getPrompt({ name: 'client_payments', arguments: { reference: '' } })).rejects.toThrow();
  });

  it('tells a server without a key how to connect, and one with a key to check its stores', async () => {
    const without = await promptText((await keyless()).client, 'getting_started');
    expect(without).toContain('npx stablevoy-mcp login');
    expect(without).toContain('not_signed_in');
    const withKey = await promptText((await keyed()).client, 'getting_started');
    expect(withKey).toContain('already connected');
    expect(withKey).toContain('get_store');
    expect(withKey).not.toContain('npx stablevoy-mcp login');
  });
});

describe('docs resources (spec SPEC-mcp-prompts-resources 4)', () => {
  it('refuses a template match that is not exactly one page', async () => {
    const resources = new DocsResources(fakeDocs().docs);
    await expect(resources.readPage(['a', 'b'])).rejects.toThrow('exactly one page');
    await expect(resources.readPage(undefined)).rejects.toThrow('exactly one page');
  });

  it('names a page by its path without the docs folder and the extension', () => {
    expect(['/docs/webhooks.md', '/mcp.md', '/docs/api/errors.md', '/docs.md'].map((p) => DocsResources.pageOf(p))).toEqual(['webhooks', 'mcp', 'api/errors', 'docs']);
  });

  it('lists every page of llms.txt and reads it, plus the fixed openapi and errors, without a key', async () => {
    const { client } = await keyless();
    const listed = (await client.listResources()).resources;
    expect(listed.map((r) => r.uri)).toEqual(expect.arrayContaining(['stablevoy://docs/openapi', 'stablevoy://docs/errors', 'stablevoy://docs/webhooks', 'stablevoy://docs/mcp']));
    expect(listed.find((r) => r.uri === 'stablevoy://docs/webhooks')).toMatchObject({ title: 'Webhooks', mimeType: 'text/markdown' });
    const [page] = (await client.readResource({ uri: 'stablevoy://docs/webhooks' })).contents;
    expect(page).toMatchObject({ uri: 'stablevoy://docs/webhooks', mimeType: 'text/markdown' });
    expect((page as { text: string }).text).toContain('# Webhooks');
    const [errors] = (await client.readResource({ uri: 'stablevoy://docs/errors' })).contents;
    expect((errors as { text: string }).text).toContain('invalid_invoice_filter');
    const [openapi] = (await client.readResource({ uri: 'stablevoy://docs/openapi' })).contents;
    expect((openapi as { text: string }).text.length).toBeGreaterThan(100);
  });

  it('refuses a page llms.txt does not list, and fails loudly when the site cannot be read', async () => {
    const { client } = await keyless();
    await expect(client.readResource({ uri: 'stablevoy://docs/secret' })).rejects.toThrow(/not a Stablevoy docs resource/);
    const files = defaultFiles();
    files[`${SITE}/llms.txt`] = () => new Response('down', { status: 503 });
    const down = await keyless(false, fakeDocs(files).docs);
    await expect(down.client.listResources()).rejects.toThrow();
    await expect(down.client.readResource({ uri: 'stablevoy://docs/webhooks' })).rejects.toThrow();
  });

  it('refuses an llms.txt whose pages would share a resource name', async () => {
    const files = defaultFiles();
    files[`${SITE}/llms.txt`] = `${LLMS_TXT}\n- [Again](${SITE}/webhooks.md): The same name.\n`;
    const { client } = await keyless(false, fakeDocs(files).docs);
    await expect(client.listResources()).rejects.toThrow(/would both be stablevoy:\/\/docs\/webhooks/);
  });
});
