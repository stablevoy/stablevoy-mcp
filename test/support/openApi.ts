import { readFileSync } from 'node:fs';

const document: unknown = JSON.parse(readFileSync(new URL('../fixtures/openapi.json', import.meta.url), 'utf8'));

/** A response example of the API's own OpenAPI document (test/fixtures/openapi.json, refreshed by scripts/refresh-openapi.js). */
export function example(method: string, path: string, status: number): Record<string, unknown> {
  let node: unknown = document;
  for (const key of ['paths', path, method.toLowerCase(), 'responses', String(status), 'content', 'application/json', 'example']) {
    if (typeof node !== 'object' || node === null || !(key in node)) throw new Error(`No example for ${method} ${path} ${status} (missing ${key})`);
    node = (node as Record<string, unknown>)[key];
  }
  // A copy: a test that changes its example must not change it for the tests after it.
  return structuredClone(node) as Record<string, unknown>;
}
