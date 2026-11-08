import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { DocsUnavailableError } from '../docs/DocsUnavailableError.js';
import { ERRORS_DOC, OPENAPI_DOC, type DocPage, type DocsLibrary } from '../docs/DocsLibrary.js';
import { UnknownDocError } from '../docs/UnknownDocError.js';

export const DOCS_RESOURCE_PREFIX = 'stablevoy://docs/';
export const DOCS_RESOURCE_TEMPLATE = `${DOCS_RESOURCE_PREFIX}{+page}`;
const MIME = 'text/markdown';

/**
 * The Stablevoy documentation as read-only MCP resources (spec SPEC-mcp-prompts-resources 4): every page listed in
 * llms.txt as stablevoy://docs/<page>, plus stablevoy://docs/openapi and stablevoy://docs/errors. Read through DocsLibrary,
 * so the same cache, timeout, size limit and "listed pages only" rule apply. Nothing is read at start; when the site
 * cannot be read, listing and reading fail with the reason, never with an empty list.
 */
export class DocsResources {
  constructor(private readonly docs: DocsLibrary) {}

  /** "/docs/webhooks.md" is "webhooks", "/mcp.md" is "mcp", "/docs/api/errors.md" is "api/errors", "/docs.md" is "docs". */
  static pageOf(path: string): string {
    const bare = path.replace(/^\//, '').replace(/\.md$/, '');
    return bare.startsWith('docs/') ? bare.slice('docs/'.length) : bare;
  }

  async list(): Promise<Resource[]> {
    const pages = await this.byPage();
    return [...pages.entries()].map(([page, doc]) => ({ uri: `${DOCS_RESOURCE_PREFIX}${page}`, name: page, title: doc.title, description: doc.description, mimeType: MIME }));
  }

  /** One listed page by its resource name, as the URI template gives it; an unknown one is refused with the list. */
  async readPage(page: string | readonly string[] | undefined): Promise<{ uri: string; mimeType: string; text: string }> {
    if (typeof page !== 'string') throw new UnknownDocError('A docs resource names exactly one page.');
    const doc = (await this.byPage()).get(page);
    if (doc === undefined) throw new UnknownDocError(`"${DOCS_RESOURCE_PREFIX}${page}" is not a Stablevoy docs resource. Use resources/list for the pages.`);
    return { uri: `${DOCS_RESOURCE_PREFIX}${page}`, mimeType: MIME, text: (await this.docs.read(doc.path)).text };
  }

  /** stablevoy://docs/openapi or stablevoy://docs/errors. */
  async readFixed(which: typeof OPENAPI_DOC | typeof ERRORS_DOC): Promise<{ uri: string; mimeType: string; text: string }> {
    return { uri: `${DOCS_RESOURCE_PREFIX}${which}`, mimeType: MIME, text: (await this.docs.read(which)).text };
  }

  private async byPage(): Promise<Map<string, DocPage>> {
    const byPage = new Map<string, DocPage>();
    for (const doc of await this.docs.pages()) {
      const page = DocsResources.pageOf(doc.path);
      if (page === OPENAPI_DOC || page === ERRORS_DOC || byPage.has(page)) throw new DocsUnavailableError(`llms.txt lists two pages that would both be ${DOCS_RESOURCE_PREFIX}${page}.`);
      byPage.set(page, doc);
    }
    return byPage;
  }
}
