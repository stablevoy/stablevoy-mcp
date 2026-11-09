import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { DocsLibrary } from '../docs/DocsLibrary.js';
import { MAX_HITS, MAX_SECTION_CHARS } from '../docs/SectionSearch.js';
import { docsToolError } from './DocsToolError.js';
import type { Tool } from './Tool.js';
import { toolResult } from './ToolResult.js';

/** The best matching sections of the Stablevoy docs (spec SPEC-mcp-docs-summary-unmatched 3.2). Needs no API key. */
export class SearchDocsTool implements Tool {
  readonly name = 'search_docs';
  readonly title = 'Search the Stablevoy documentation';
  readonly description = `Searches the Stablevoy documentation for how-to questions and returns up to ${MAX_HITS} matching sections. Needs no key. Matching ignores case and common words such as "the", "how" and "to"; a section ranks higher for each query word it contains, more when the word is in its heading or page title, so two to four specific words work best, for example "webhook signature" or "Tron fee". Each hit has the page title, its path for get_doc, the page address, the heading and up to ${MAX_SECTION_CHARS} characters of the section. An empty list means no word matched; try other words. Topics: connecting a shop, stores, webhooks and their signatures, networks and fees, the payment widget, the plugins, recovery. Call get_doc with a path to read the whole page. The pages are kept for an hour, so searching again costs nothing.`;
  readonly input = { query: z.string().min(2).max(200).describe('2 to 200 characters: the words to look for, for example "webhook retries". Words shorter than 2 letters and common words are dropped; a query of only those matches nothing.') };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(
    private readonly docs: DocsLibrary,
    private readonly footer: string | null,
  ) {}

  async run(args: { query: string }): Promise<CallToolResult> {
    try {
      const sections = await this.docs.search(args.query);
      const summary = sections.length === 0 ? `No section matches "${args.query}"; try other words, or get_doc with a path from llms.txt.` : `${sections.length} section${sections.length === 1 ? '' : 's'} for "${args.query}".`;
      return toolResult(this.footer === null ? summary : `${summary} ${this.footer}`, { sections });
    } catch (error) {
      return docsToolError(error);
    }
  }
}
