import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** A short line for the model plus the exact fields, as text and as structured content. */
export function toolResult(summary: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: `${summary}\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
