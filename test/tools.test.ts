import { describe, expect, it } from 'vitest';
import { TransportError, UnexpectedResponseError } from 'stablevoy';
import { createServer, SERVER_INSTRUCTIONS } from '../src/server/ServerFactory.js';
import { toolsFor } from '../src/server/toolsFor.js';
import { StoreClient } from '../src/stores/StoreClient.js';
import { StoreClients } from '../src/stores/StoreClients.js';
import { centsOf, usdOf, usdOfMicros } from '../src/tools/AmountUsd.js';
import { idempotencyKeyOf } from '../src/tools/IdempotencyKey.js';
import { errorText } from '../src/tools/ToolError.js';
import { fakeStablevoy, problem, type Routes } from './support/FakeApi.js';
import { connectClient, textOf } from './support/McpHarness.js';
import { fakeDocs } from './support/FakeSite.js';
import { example } from './support/openApi.js';

const INVOICE = '7c3360b5-e8cc-4775-8a13-7324d4f1296e';

function storeRoutes(name: string, id: string, extra: Routes = {}): Routes {
  return {
    'GET /v1/store': () => ({ status: 200, body: { ...example('GET', '/v1/store', 200), id, name } }),
    'GET /v1/limits': () => ({ status: 200, body: example('GET', '/v1/limits', 200) }),
    'GET /v1/pricing': () => ({ status: 200, body: example('GET', '/v1/pricing', 200) }),
    ...extra,
  };
}

async function serverWith(stores: { routes: Routes; known?: { id: string; name: string } }[], readOnly = false) {
  const fakes = stores.map((s) => fakeStablevoy(s.routes));
  const clients = new StoreClients(fakes.map((f, i) => new StoreClient(f.api, stores[i]?.known ?? null)));
  const { client, call } = await connectClient(createServer('stablevoy-mcp', '0.1.0', toolsFor(clients, readOnly, fakeDocs().docs), true));
  return { client, call, fakes };
}

describe('amounts and idempotency', () => {
  it('turns dollar strings into cents exactly and back', () => {
    expect([centsOf('250'), centsOf('19.9'), centsOf(' 19.99 '), centsOf('0.01')]).toEqual([25_000, 1990, 1999, 1]);
    for (const bad of ['', '1.234', '-5', '1e3', '12,50', '1234567890']) expect(centsOf(bad), bad).toBeNull();
    expect([usdOf(1999), usdOf(5), usdOf(25_000)]).toEqual(['19.99', '0.05', '250.00']);
  });

  it('keys the same store, amount and reference alike, in printable ASCII', () => {
    const key = idempotencyKeyOf('s1', 1999, 'заказ 42');
    expect(key).toMatch(/^mcp-[0-9a-f]{64}$/);
    expect(idempotencyKeyOf('s1', 1999, 'заказ 42')).toBe(key);
    expect(idempotencyKeyOf('s2', 1999, 'заказ 42')).not.toBe(key);
  });
});

describe('the MCP server (spec SPEC-mcp-server 3.3)', () => {
  it('lists every tool with annotations, and none that writes in read-only mode', async () => {
    const { client } = await serverWith([{ routes: storeRoutes('Main', 's1') }]);
    const { tools } = await client.listTools();
    const writes = ['cancel_invoice', 'create_invoice'];
    expect(tools.map((t) => t.name).sort()).toEqual(['cancel_invoice', 'create_invoice', 'get_doc', 'get_invoice', 'get_store', 'list_invoices', 'list_stores', 'list_unmatched_transfers', 'search_docs', 'summarize_payments']);
    expect(tools.find((t) => t.name === 'create_invoice')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tools.find((t) => t.name === 'cancel_invoice')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    expect(tools.filter((t) => !writes.includes(t.name)).every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    const readOnly = await serverWith([{ routes: storeRoutes('Main', 's1') }], true);
    const offered = (await readOnly.client.listTools()).tools.map((t) => t.name);
    for (const name of writes) expect(offered).not.toContain(name);
  });

  it('describes every tool with a verb first and the sibling to use instead (spec SPEC-mcp-tool-descriptions)', async () => {
    const { client } = await serverWith([{ routes: storeRoutes('Main', 's1') }]);
    const described = Object.fromEntries((await client.listTools()).tools.map((t) => [t.name, t.description ?? '']));
    const sibling: Record<string, string> = {
      list_stores: 'get_store',
      get_store: 'list_stores',
      get_invoice: 'list_invoices',
      list_invoices: 'get_invoice',
      create_invoice: 'get_invoice',
      cancel_invoice: 'get_invoice',
      summarize_payments: 'list_invoices',
      list_unmatched_transfers: 'get_invoice',
      search_docs: 'get_doc',
      get_doc: 'search_docs',
    };
    for (const [name, other] of Object.entries(sibling)) {
      expect(described[name], name).toMatch(/^(Lists|Gets|Creates|Cancels|Sums|Searches) /);
      expect(described[name], name).toContain(other);
    }
  });

  it('lists the stores, a failing key shown with its error and the others still', async () => {
    const { call } = await serverWith([{ routes: storeRoutes('Main', 's1') }, { routes: { 'GET /v1/store': () => ({ status: 401, body: problem(401, 'authentication_failed', 'Invalid API key') }) }, known: { id: 's2', name: 'Old' } }]);
    const result = await call('list_stores');
    expect(textOf(result)).toContain('2 stores connected.');
    const rows = (result.structuredContent as { stores: Record<string, unknown>[] }).stores;
    expect(rows[0]).toMatchObject({ id: 's1', name: 'Main', canAcceptPayments: true });
    expect(String(rows[1]?.['error'])).toContain('authentication_failed: the API key was refused');
  });

  it('reads a store with its payout addresses, limits in effect and fee', async () => {
    const { call } = await serverWith([{ routes: storeRoutes('Main', 's1') }]);
    const result = await call('get_store');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ id: 's1', name: 'Main', payoutAddresses: example('GET', '/v1/store', 200)['payoutAddresses'], invoiceRangeUsd: { min: expect.any(String) as unknown, max: expect.any(String) as unknown } });
    expect(textOf(result)).toMatch(/^Store "Main" is active; invoices from \d+\.\d\d to \d+\.\d\d USD\./);
  });

  it('creates an invoice from a dollar string, idempotent by reference, and says when it was replayed', async () => {
    const created = example('POST', '/v1/invoices', 201);
    const { call, fakes } = await serverWith([{ routes: storeRoutes('Main', 's1', { 'POST /v1/invoices': () => ({ status: 201, body: { ...created, replayed: false } }) }) }]);
    const result = await call('create_invoice', { amountUsd: '19.99', reference: 'acme-october', returnUrl: 'https://shop.example/thanks' });
    expect(textOf(result)).toContain(`Invoice created. Payment link: ${String(created['checkoutUrl'])}`);
    const post = fakes[0]?.sent.find((s) => s.key === 'POST /v1/invoices');
    expect(post?.body).toEqual({ amountUsdCents: 1999, externalReference: 'acme-october', returnUrl: 'https://shop.example/thanks' });
    expect(post?.headers['idempotency-key']).toBe(idempotencyKeyOf('s1', 1999, 'acme-october'));

    const again = await serverWith([{ routes: storeRoutes('Main', 's1', { 'POST /v1/invoices': () => ({ status: 200, body: { ...created, replayed: true } }) }), known: { id: 's1', name: 'Main' } }]);
    expect(textOf(await again.call('create_invoice', { amountUsd: '19.99', reference: 'acme-october' }))).toContain('This invoice already existed');
    const bare = again.fakes[0]?.sent.at(-1);
    expect(bare?.headers['idempotency-key']).toBe(idempotencyKeyOf('s1', 1999, 'acme-october'));

    await again.call('create_invoice', { amountUsd: '5' });
    expect(again.fakes[0]?.sent.at(-1)?.headers['idempotency-key']).toBeUndefined();

    await again.call('create_invoice', { amountUsd: '5', expiresInMinutes: 1440 });
    expect(again.fakes[0]?.sent.at(-1)?.body).toEqual({ amountUsdCents: 500, expiresInMinutes: 1440 });
    const outside = await again.call('create_invoice', { amountUsd: '5', expiresInMinutes: 5 });
    expect(outside.isError).toBe(true);
    expect(again.fakes[0]?.sent.at(-1)?.body).toEqual({ amountUsdCents: 500, expiresInMinutes: 1440 });
  });

  it('cancels an invoice in whichever store has it, and passes a refusal with a hint', async () => {
    const invoice = { ...example('POST', '/v1/invoices/{invoiceId}/cancel', 200), id: INVOICE, status: 'cancelled' };
    const path = `POST /v1/invoices/${INVOICE}/cancel`;
    const { call, fakes } = await serverWith([
      { routes: storeRoutes('Main', 's1', { [path]: () => ({ status: 404, body: problem(404, 'not_found', 'Invoice not found') }) }), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Second', 's2', { [path]: () => ({ status: 200, body: invoice }) }), known: { id: 's2', name: 'Second' } },
    ]);
    const cancelled = await call('cancel_invoice', { invoiceId: INVOICE });
    expect(cancelled.structuredContent).toMatchObject({ store: 'Second', id: INVOICE, status: 'cancelled' });
    expect(textOf(cancelled).startsWith(`Invoice ${INVOICE} of store "Second" is cancelled.`)).toBe(true);
    expect(fakes.map((f) => f.sent.filter((s) => s.key === path).length)).toEqual([1, 1]);
    expect(textOf(await call('cancel_invoice', { invoiceId: INVOICE, store: 'Main' }))).toBe(`not_found: no connected store has invoice ${INVOICE}.`);

    const paid = await serverWith([{ routes: storeRoutes('Main', 's1', { [path]: () => ({ status: 409, body: problem(409, 'invoice_not_cancellable', 'Only an invoice that is still waiting for its first payment can be cancelled.') }) }) }]);
    const refused = await paid.call('cancel_invoice', { invoiceId: INVOICE });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain('invoice_not_cancellable: Only an invoice that is still waiting for its first payment can be cancelled. A payment has already been seen');
  });

  it('refuses a bad amount or return address before calling the API, and passes the API refusal with a hint', async () => {
    const { call, fakes } = await serverWith([{ routes: storeRoutes('Main', 's1', { 'POST /v1/invoices': () => ({ status: 422, body: problem(422, 'payout_address_unacknowledged', 'Review the payout address') }) }) }]);
    expect(textOf(await call('create_invoice', { amountUsd: '0' }))).toContain('invalid_amount');
    expect(textOf(await call('create_invoice', { amountUsd: '1.234' }))).toContain('invalid_amount');
    expect(textOf(await call('create_invoice', { amountUsd: '5', returnUrl: 'http://shop.example' }))).toContain('invalid_return_url');
    expect(fakes[0]?.sent).toHaveLength(0);
    const refused = await call('create_invoice', { amountUsd: '5' });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toBe('payout_address_unacknowledged: Review the payout address The merchant must review and confirm the payout address in the Stablevoy dashboard. Do not retry.');
  });

  it('finds an invoice in whichever store has it, and says when none has', async () => {
    const invoice = example('GET', '/v1/invoices/{invoiceId}', 200);
    const missing = { [`GET /v1/invoices/${INVOICE}`]: () => ({ status: 404, body: problem(404, 'not_found', 'Invoice not found') }) };
    const { call } = await serverWith([
      { routes: storeRoutes('Main', 's1', missing), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Second', 's2', { [`GET /v1/invoices/${INVOICE}`]: () => ({ status: 200, body: { ...invoice, id: INVOICE } }) }), known: { id: 's2', name: 'Second' } },
    ]);
    const found = await call('get_invoice', { invoiceId: INVOICE });
    expect(found.structuredContent).toMatchObject({ store: 'Second', id: INVOICE, status: invoice['status'] });
    expect(textOf(await call('get_invoice', { invoiceId: INVOICE, store: 'Main' }))).toBe(`not_found: no connected store has invoice ${INVOICE}.`);
    const broken = await serverWith([{ routes: { [`GET /v1/invoices/${INVOICE}`]: () => new TypeError('fetch failed') } }]);
    expect(textOf(await broken.call('get_invoice', { invoiceId: INVOICE }))).toContain('TransportError');
  });

  it('lists one page per store, filters passed through, and a cursor only with its store', async () => {
    const page = example('GET', '/v1/invoices', 200);
    const { call, fakes } = await serverWith([
      { routes: storeRoutes('Main', 's1', { 'GET /v1/invoices': () => ({ status: 200, body: { ...page, nextCursor: 'next-1' } }) }), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Second', 's2', { 'GET /v1/invoices': () => ({ status: 200, body: { items: [], nextCursor: null } }) }), known: { id: 's2', name: 'Second' } },
    ]);
    const both = await call('list_invoices', { status: 'paid', createdFrom: '2026-11-01' });
    expect((both.structuredContent as { pages: { store: string; nextCursor: string | null }[] }).pages.map((p) => [p.store, p.nextCursor])).toEqual([['Main', 'next-1'], ['Second', null]]);
    expect(textOf(both)).toContain('more on the next page');
    const query = fakes[0]?.sent.at(-1)?.url.searchParams;
    expect([query?.get('status'), query?.get('createdFrom'), query?.get('limit')]).toEqual(['paid', '2026-11-01', '20']);
    expect(textOf(await call('list_invoices', { cursor: 'next-1' }))).toBe('cursor needs the store it came from: pass store too.');
    const next = await call('list_invoices', { cursor: 'next-1', store: 'Main', limit: 5 });
    expect(next.isError).toBeUndefined();
    expect(fakes[0]?.sent.at(-1)?.url.searchParams.get('cursor')).toBe('next-1');
    const one = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices': () => ({ status: 200, body: { items: [], nextCursor: null } }) }) }]);
    expect(textOf(await one.call('list_invoices'))).toMatch(/^0 invoices\./);
  });

  it('asks for the store when several are connected, and never guesses', async () => {
    const { call } = await serverWith([
      { routes: storeRoutes('Main', 's1'), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Main', 's2'), known: { id: 's2', name: 'Main' } },
    ]);
    expect(textOf(await call('get_store'))).toBe('Several stores are connected; pass store with one of: "Main" (s1), "Main" (s2)');
    expect(textOf(await call('get_store', { store: 'Main' }))).toContain('Several stores are named "Main"; pass the store id instead');
    expect(textOf(await call('get_store', { store: 'Nope' }))).toContain('No connected store is "Nope". Connected stores: "Main" (s1), "Main" (s2) (store Nope)');
    expect((await call('get_store', { store: 's2' })).structuredContent).toMatchObject({ id: 's2' });
  });
});

describe('more answers', () => {
  it('shows the store limits when set, the payments of an invoice, one invoice in the singular, and a list that fails', async () => {
    const limited = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/store': () => ({ status: 200, body: { ...example('GET', '/v1/store', 200), id: 's1', name: 'Main', minInvoiceUsdCents: 1000, maxInvoiceUsdCents: 50_000 } }) }) }]);
    expect((await limited.call('get_store')).structuredContent).toMatchObject({ storeLimitsUsd: { min: '10.00', max: '500.00' } });

    const invoice = example('GET', '/v1/invoices/{invoiceId}', 200);
    const payment = { id: 'p1', network: 'base', amountDueUsdCents: 1999, token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', amount: '19990000', txHash: '0x' + 'ab'.repeat(32), status: 'confirmed', screeningStatus: 'clear', detectedAt: '2026-11-05T10:00:00.000Z' };
    const paid = await serverWith([{ routes: { [`GET /v1/invoices/${INVOICE}`]: () => ({ status: 200, body: { ...invoice, id: INVOICE, payments: [payment] } }), ...storeRoutes('Main', 's1') } }]);
    expect((await paid.call('get_invoice', { invoiceId: INVOICE })).structuredContent).toMatchObject({ payments: [{ network: 'base', amount: '19990000', status: 'confirmed', detectedAt: '2026-11-05T10:00:00.000Z' }] });

    const page = example('GET', '/v1/invoices', 200);
    const one = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices': () => ({ status: 200, body: { items: [(page['items'] as unknown[])[0]], nextCursor: null } }) }) }]);
    expect(textOf(await one.call('list_invoices'))).toBe(`1 invoice.\n${textOf(await one.call('list_invoices')).split('\n').slice(1).join('\n')}`);
    const failing = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices': () => ({ status: 400, body: problem(400, 'invalid_invoice_filter', 'Bad filter') }) }) }]);
    expect(textOf(await failing.call('list_invoices', { status: 'nope' }))).toBe('invalid_invoice_filter: Bad filter Check the filters: status and source from the tool description, days as YYYY-MM-DD with createdFrom not after createdTo. summarize_payments covers at most 92 days per call; split a year into four quarters.');
  });
});

describe('tool errors', () => {
  it('names the code and what to do, for every kind of SDK failure', () => {
    expect(errorText(new UnexpectedResponseError('store.id is missing'))).toBe('UnexpectedResponseError: store.id is missing');
    expect(errorText(new TransportError('Cannot reach the Stablevoy API'))).toBe('TransportError: Cannot reach the Stablevoy API');
    expect(() => errorText(new Error('a bug'))).toThrow('a bug');
  });

  it('gives the wait of a rate limit and the plain detail of an unhinted code', async () => {
    const limited = await serverWith([{ routes: { 'GET /v1/store': () => ({ status: 400, body: problem(400, 'validation_failed', 'Bad input') }) } }]);
    expect(textOf(await limited.call('list_stores'))).toContain('validation_failed: Bad input');
    const slow = await serverWith([{ routes: storeRoutes('Main', 's1', { 'POST /v1/invoices': () => ({ status: 429, body: problem(429, 'rate_limited', 'Too many requests.') }) }) }]);
    expect(textOf(await slow.call('create_invoice', { amountUsd: '5' }))).toMatch(/^rate_limited: Too many requests\. Retry after \d+ seconds\./);
  });
});

describe('store clients', () => {
  it('learn the store of a bare key once, and need at least one key', async () => {
    const fake = fakeStablevoy(storeRoutes('Main', 's1'));
    const client = new StoreClient(fake.api, null);
    expect(await client.identity()).toEqual({ id: 's1', name: 'Main' });
    expect(await client.identity()).toEqual({ id: 's1', name: 'Main' });
    expect(fake.sent.filter((s) => s.key === 'GET /v1/store')).toHaveLength(1);
    expect(() => new StoreClients([])).toThrow('at least one store key');
  });
});

describe('payment summary and unmatched transfers (spec SPEC-mcp-docs-summary-unmatched 3.3, 3.4)', () => {
  const summary = (base: string, tron: string) => ({
    ...example('GET', '/v1/invoices/summary', 200),
    invoicedUsdCents: 48500,
    receivedUsdMicros: String(BigInt(base) + BigInt(tron)),
    byNetwork: [
      { network: 'base', token: 'USDC', payments: 2, receivedUsdMicros: base },
      { network: 'tron', token: 'USDT', payments: 1, receivedUsdMicros: tron },
    ],
  });

  it('sums up one store in dollars, asking the API for the period or the days', async () => {
    const { call, fakes } = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices/summary': () => ({ status: 200, body: summary('251200000', '98500137') }) }) }]);
    const week = await call('summarize_payments', { period: 'last_7_days' });
    expect(textOf(week)).toMatch(/^12 invoices from 2026-11-01 to 2026-11-07, 349\.700137 USD received\./);
    expect(week.structuredContent).toMatchObject({ store: 'Main', invoicedUsd: '485.00', receivedUsd: '349.700137', byNetwork: [{ network: 'base', token: 'USDC', payments: 2, receivedUsd: '251.20' }, { network: 'tron', receivedUsd: '98.500137' }] });
    await call('summarize_payments', { createdFrom: '2026-10-01', createdTo: '2026-10-31' });
    expect(fakes[0]?.sent.filter((s) => s.key === 'GET /v1/invoices/summary').map((s) => s.url.search)).toEqual(['?period=last_7_days', '?createdFrom=2026-10-01&createdTo=2026-10-31']);
  });

  it('gives each store and the total when several are connected', async () => {
    const { call } = await serverWith([
      { routes: storeRoutes('Main', 's1', { 'GET /v1/invoices/summary': () => ({ status: 200, body: summary('1000000', '0') }) }), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Second', 's2', { 'GET /v1/invoices/summary': () => ({ status: 200, body: summary('2000000', '500000') }) }), known: { id: 's2', name: 'Second' } },
    ]);
    const result = (await call('summarize_payments', { period: 'this_month' })).structuredContent as { stores: { store: string }[]; total: Record<string, unknown> };
    expect(result.stores.map((s) => s.store)).toEqual(['Main', 'Second']);
    expect(result.total).toMatchObject({ invoices: { count: 24, byStatus: { paid: 16 } }, invoicedUsd: '970.00', receivedUsd: '3.50', byNetwork: [{ network: 'base', payments: 4, receivedUsd: '3.00' }, { network: 'tron', payments: 2, receivedUsd: '0.50' }] });
  });

  it.each([{}, { period: 'last_7_days', createdFrom: '2026-10-01' }, { createdFrom: '2026-10-01' }, { createdTo: '2026-10-31' }])('refuses %j before calling the API', async (args) => {
    const { call, fakes } = await serverWith([{ routes: storeRoutes('Main', 's1') }]);
    const refused = await call('summarize_payments', args);
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toBe('Pass either period or both createdFrom and createdTo.');
    expect(fakes[0]?.sent).toEqual([]);
  });

  it('passes the refusal of a long range with what to do', async () => {
    const { call } = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices/summary': () => ({ status: 400, body: problem(400, 'invalid_invoice_filter', 'At most 92 days.') }) }) }]);
    expect(textOf(await call('summarize_payments', { createdFrom: '2026-01-01', createdTo: '2026-12-31' }))).toMatch(/^invalid_invoice_filter: At most 92 days\. Check the filters: .* split a year into four quarters\.$/);
  });

  it('lists each unmatched transfer once with the stores it was seen for, dollars and the explorer link', async () => {
    const [transfer] = example('GET', '/v1/unmatched-transfers', 200) as unknown as Record<string, unknown>[];
    const older = { ...transfer, id: '00000000-0000-4000-8000-000000000001', network: 'base', txHash: '0xcd', detectedAt: '2026-10-01T00:00:00.000Z', sharedWithStores: 2 };
    const routes = (list: unknown[]) => ({ 'GET /v1/unmatched-transfers': () => ({ status: 200, body: list }) });
    const { call } = await serverWith([
      { routes: storeRoutes('Main', 's1', routes([older, { ...transfer, sharedWithStores: 2 }])), known: { id: 's1', name: 'Main' } },
      { routes: storeRoutes('Second', 's2', routes([{ ...transfer, sharedWithStores: 2 }])), known: { id: 's2', name: 'Second' } },
    ]);
    const result = await call('list_unmatched_transfers');
    expect(textOf(result)).toMatch(/^2 unmatched transfers; the merchant attaches them to invoices in the dashboard\./);
    const { transfers } = result.structuredContent as { transfers: Record<string, unknown>[] };
    expect(transfers.map((t) => t['stores'])).toEqual([['Main', 'Second'], ['Main']]);
    expect(transfers[0]).toMatchObject({ amountUsd: '98.500137', token: 'USDT', network: 'tron', sharedWithStores: 2, explorerUrl: `${String(transfer?.['explorerTxUrl'])}${'ab'.repeat(32)}` });
    expect(transfers[1]).toMatchObject({ explorerUrl: `${String(transfer?.['explorerTxUrl'])}0xcd` });
    const none = await serverWith([{ routes: storeRoutes('Main', 's1', routes([])) }]);
    expect(textOf(await none.call('list_unmatched_transfers'))).toMatch(/^No unmatched transfers\./);
    const failing = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/unmatched-transfers': () => ({ status: 429, body: problem(429, 'rate_limited', 'Slow down.') }) }) }]);
    expect(textOf(await failing.call('list_unmatched_transfers', { store: 'Main' }))).toMatch(/^rate_limited: Slow down\./);
    expect(textOf(await failing.call('list_unmatched_transfers'))).toMatch(/^rate_limited: Slow down\. Retry after \d+ seconds\.$/);
  });

  it('turns millionths of a dollar into exact dollars', () => {
    expect([usdOfMicros('0'), usdOfMicros('5'), usdOfMicros('1000000'), usdOfMicros(123_456_789n)]).toEqual(['0.00', '0.000005', '1.00', '123.456789']);
  });
});

describe('with a store key', () => {
  it('offers the docs tools without the sign-in notice, and says one section, one invoice and one transfer in the singular', async () => {
    const [transfer] = example('GET', '/v1/unmatched-transfers', 200) as unknown as Record<string, unknown>[];
    const one = { ...example('GET', '/v1/invoices/summary', 200), invoices: { count: 1, byStatus: { paid: 1 } } };
    const { call } = await serverWith([{ routes: storeRoutes('Main', 's1', { 'GET /v1/invoices/summary': () => ({ status: 200, body: one }), 'GET /v1/unmatched-transfers': () => ({ status: 200, body: [transfer] }) }) }]);
    expect(textOf(await call('search_docs', { query: 'login connect page' }))).toMatch(/^1 section for "login connect page"\.\n/);
    expect(textOf(await call('get_doc', { path: '/mcp.md' })).endsWith('/mcp/\n')).toBe(true);
    expect(textOf(await call('summarize_payments', { period: 'last_month' }))).toMatch(/^1 invoice from /);
    expect(textOf(await call('list_unmatched_transfers'))).toMatch(/^1 unmatched transfer;/);
  });
});
