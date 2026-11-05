import { Stablevoy } from 'stablevoy';

export type Reply = { readonly status: number; readonly body?: unknown } | Error;
export type Routes = Record<string, (request: { body: unknown; url: URL }) => Reply>;

/** A Stablevoy SDK client whose fetch answers from `routes`, keyed "METHOD /path". Records what was sent. */
export function fakeStablevoy(routes: Routes, apiKey = 'sk_live_test'): { api: Stablevoy; sent: { key: string; url: URL; body: unknown; headers: Record<string, string> }[] } {
  const sent: { key: string; url: URL; body: unknown; headers: Record<string, string> }[] = [];
  const fetchFn = ((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const body = init?.body === undefined || init.body === null ? undefined : (JSON.parse(init.body as string) as unknown);
    sent.push({ key, url, body, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const route = routes[key];
    const reply: Reply = route === undefined ? { status: 404, body: problem(404, 'not_found', `no route ${key}`) } : route({ body, url });
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { api: Stablevoy.create({ apiKey, fetch: fetchFn, sleep: () => Promise.resolve() }), sent };
}

export function problem(status: number, code: string, detail: string): Record<string, unknown> {
  return { type: `https://stablevoy.com/docs/api/errors/#error-${code}`, title: code, status, code, detail };
}
