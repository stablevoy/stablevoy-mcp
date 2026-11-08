import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { DocsLibrary } from '../docs/DocsLibrary.js';
import { MAX_HITS } from '../docs/SectionSearch.js';
import { docsToolError } from './DocsToolError.js';
import type { Tool } from './Tool.js';
import { toolResult } from './ToolResult.js';

/** The best matching sections of the Stablevoy docs (spec SPEC-mcp-docs-summary-unmatched 3.2). Needs no API key. */
export class SearchDocsTool implements Tool {
  readonly name = 'search_docs';
  readonly title = 'Search the Stablevoy documentation';
  readonly description = `Searches the Stablevoy documentation and returns up to ${MAX_HITS} matching sections, each with the page title, its path for get_doc, the page address, the heading and the text. Needs no key. Use it for how-to questions: connecting a shop, creating a store, webhooks and their signatures, networks and fees, the payment widget, the plugins, recovery. Ask with a few plain words, for example "webhook signature" or "Tron fee". An empty list means no section matched; try other words. Call get_doc with a path to read the whole page. The pages are kept for an hour, so searching again costs nothing.`;
  readonly input = { query: z.string().min(2).max(200).describe('A few words to look for, for example "webhook retries".') };
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
