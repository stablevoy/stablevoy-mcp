import { DocsUnavailableError } from './DocsUnavailableError.js';

export const DOCS_CACHE_MS = 60 * 60 * 1000;
export const DOCS_TIMEOUT_MS = 10_000;
export const DOCS_MAX_BYTES = 1024 * 1024;

export interface DocsFetcherOptions {
  readonly fetch: typeof fetch;
  readonly now: () => number;
  readonly cacheMs?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

/**
 * Reads public documentation files, each kept in memory for an hour, so an assistant that searches in a loop does not
 * reach the site again. Every failure is an error naming the address; an expired copy is never served instead.
 */
export class DocsFetcher {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly cache = new Map<string, { readonly text: string; readonly at: number }>();

  constructor(options: DocsFetcherOptions) {
    this.fetchFn = options.fetch;
    this.now = options.now;
    this.cacheMs = options.cacheMs ?? DOCS_CACHE_MS;
    this.timeoutMs = options.timeoutMs ?? DOCS_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DOCS_MAX_BYTES;
  }

  async text(url: string): Promise<string> {
    const cached = this.cache.get(url);
    if (cached !== undefined && this.now() - cached.at < this.cacheMs) return cached.text;
    const text = await this.download(url);
    this.cache.set(url, { text, at: this.now() });
    return text;
  }

  private async download(url: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? `no answer in ${this.timeoutMs / 1000} seconds` : 'cannot be reached';
      throw new DocsUnavailableError(`${url} ${reason}; try again later.`);
    }
    if (!response.ok) throw new DocsUnavailableError(`${url} answered HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length'));
    if (length > this.maxBytes) throw new DocsUnavailableError(`${url} is larger than ${this.maxBytes} bytes.`);
    const body = await response.arrayBuffer();
    if (body.byteLength > this.maxBytes) throw new DocsUnavailableError(`${url} is larger than ${this.maxBytes} bytes.`);
    return new TextDecoder().decode(body);
  }
}
