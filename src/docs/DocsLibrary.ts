import type { DocsFetcher } from './DocsFetcher.js';
import { DocsUnavailableError } from './DocsUnavailableError.js';
import { errorCatalogText } from './ErrorCatalogText.js';
import { parseLlmsTxt, type DocEntry } from './LlmsIndex.js';
import { sectionsOf } from './MarkdownSections.js';
import { openApiOutline } from './OpenApiOutline.js';
import { searchSections, type SearchablePage, type SectionHit } from './SectionSearch.js';
import { UnknownDocError } from './UnknownDocError.js';

export const OPENAPI_DOC = 'openapi';
export const ERRORS_DOC = 'errors';

/** A page get_doc can return: its address for get_doc, the page on the site and what it is about. */
export interface DocPage {
  readonly path: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
}

const PARALLEL_FETCHES = 6;
/** More pages than this in llms.txt is not our site: refused rather than fetched. */
export const MAX_DOC_PAGES = 100;

/**
 * The Stablevoy documentation from the site's llms.txt: only the pages it lists, plus the API's OpenAPI outline and
 * error catalog, so get_doc cannot be turned into a reader of any other address.
 */
export class DocsLibrary {
  private readonly fetcher: DocsFetcher;
  private readonly siteUrl: string;
  private readonly apiUrl: string;

  constructor(deps: { fetcher: DocsFetcher; siteUrl: string; apiUrl: string }) {
    this.fetcher = deps.fetcher;
    this.siteUrl = deps.siteUrl;
    this.apiUrl = deps.apiUrl;
  }

  async pages(): Promise<DocPage[]> {
    const index = `${this.siteUrl}/llms.txt`;
    const entries = parseLlmsTxt(await this.fetcher.text(index)).filter((e) => e.url.startsWith(`${this.siteUrl}/`) && e.url.endsWith('.md'));
    if (entries.length === 0) throw new DocsUnavailableError(`${index} lists no pages.`);
    if (entries.length > MAX_DOC_PAGES) throw new DocsUnavailableError(`${index} lists ${entries.length} pages, more than ${MAX_DOC_PAGES}.`);
    return entries.map((e) => this.pageOf(e));
  }

  /** One page as Markdown, by the path from search_docs or the list, its full address, or "openapi" or "errors". */
  async read(path: string): Promise<{ title: string; text: string }> {
    const wanted = path.trim();
    if (wanted === OPENAPI_DOC) {
      const url = `${this.apiUrl}/v1/openapi.json`;
      return { title: 'Stablevoy API operations', text: openApiOutline(this.json(await this.fetcher.text(url), url), url, this.apiUrl) };
    }
    if (wanted === ERRORS_DOC) {
      const url = `${this.apiUrl}/v1/errors`;
      return { title: 'Stablevoy API error codes', text: errorCatalogText(this.json(await this.fetcher.text(url), url), url) };
    }
    const pages = await this.pages();
    const page = pages.find((p) => p.path === this.pathOf(wanted));
    if (page === undefined) throw new UnknownDocError(`"${path}" is not a Stablevoy docs page. Pass one of: ${[...pages.map((p) => p.path), OPENAPI_DOC, ERRORS_DOC].join(', ')}.`);
    return { title: page.title, text: await this.fetcher.text(`${this.siteUrl}${page.path}`) };
  }

  async search(query: string): Promise<SectionHit[]> {
    const pages = await this.pages();
    const searchable: SearchablePage[] = [];
    for (let i = 0; i < pages.length; i += PARALLEL_FETCHES) {
      const batch = pages.slice(i, i + PARALLEL_FETCHES);
      const read = await Promise.all(batch.map(async (p) => ({ title: p.title, path: p.path, url: p.url, sections: sectionsOf(await this.fetcher.text(`${this.siteUrl}${p.path}`)) })));
      searchable.push(...read);
    }
    return searchSections(searchable, query);
  }

  private pageOf(entry: DocEntry): DocPage {
    const path = entry.url.slice(this.siteUrl.length);
    return { path, url: `${this.siteUrl}${path.slice(0, -'.md'.length)}/`, title: entry.title, description: entry.description };
  }

  /** "/docs/webhooks.md", "/docs/webhooks/", "docs/webhooks" or the full address of either, as the path of the .md copy. */
  private pathOf(wanted: string): string {
    let path = wanted.startsWith(this.siteUrl) ? wanted.slice(this.siteUrl.length) : wanted;
    const anchor = path.indexOf('#');
    if (anchor !== -1) path = path.slice(0, anchor);
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.endsWith('/')) path = path.slice(0, -1);
    return path.endsWith('.md') ? path : `${path}.md`;
  }

  private json(text: string, url: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new DocsUnavailableError(`${url} did not answer with JSON.`);
    }
  }
}
