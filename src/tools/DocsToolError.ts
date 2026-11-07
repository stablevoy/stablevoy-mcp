import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DocsUnavailableError } from '../docs/DocsUnavailableError.js';
import { UnknownDocError } from '../docs/UnknownDocError.js';

/** A docs failure as a tool error naming the address or the paths to use, never an empty result; anything else is a bug and is thrown on. */
export function docsToolError(error: unknown): CallToolResult {
  if (error instanceof DocsUnavailableError) return { content: [{ type: 'text', text: `docs_unavailable: ${error.message}` }], isError: true };
  if (error instanceof UnknownDocError) return { content: [{ type: 'text', text: `unknown_doc: ${error.message}` }], isError: true };
  throw error;
}
