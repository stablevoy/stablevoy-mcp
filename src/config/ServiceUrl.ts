import { McpConfigError } from './McpConfigError.js';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** An address of Stablevoy: https, or http on this machine to test against a local API. `base` drops trailing slashes. */
export function serviceUrl(name: string, value: string | undefined, fallback: string, base: boolean): string {
  const raw = value === undefined || value === '' ? fallback : value;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpConfigError(`${name} is not a valid URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL.has(url.hostname))) throw new McpConfigError(`${name} must use https (http only on localhost)`);
  return base ? raw.replace(/\/+$/, '') : raw;
}
