import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ERRORS_DOC, OPENAPI_DOC, type DocsLibrary } from '../docs/DocsLibrary.js';
import { docsToolError } from './DocsToolError.js';
import type { Tool } from './Tool.js';

/** One whole docs page as Markdown, or the API operations or error codes (spec SPEC-mcp-docs-summary-unmatched 3.2). Needs no API key. */
export class GetDocTool implements Tool {
  readonly name = 'get_doc';
  readonly title = 'Read a Stablevoy documentation page';
  readonly description = `Gets one whole page of the Stablevoy documentation as Markdown. Pass a path from search_docs, for example "/docs/webhooks.md", or "${OPENAPI_DOC}" for every API endpoint with its parameters, or "${ERRORS_DOC}" for every error code with what to do. Only Stablevoy pages are read; any other address is refused with the list of pages. Use search_docs first when you do not know which page has the answer. Needs no API key.`;
  readonly input = { path: z.string().min(1).max(300).describe(`A docs path like "/docs/webhooks.md", or "${OPENAPI_DOC}", or "${ERRORS_DOC}".`) };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  constructor(
    private readonly docs: DocsLibrary,
    private readonly footer: string | null,
  ) {}

  async run(args: { path: string }): Promise<CallToolResult> {
    try {
      const doc = await this.docs.read(args.path);
      return { content: [{ type: 'text', text: this.footer === null ? doc.text : `${doc.text}\n${this.footer}\n` }] };
    } catch (error) {
      return docsToolError(error);
    }
  }
}
