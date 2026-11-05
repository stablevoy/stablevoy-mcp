import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

/** One MCP tool: its schema and annotations for the client, and what it does. Arguments arrive validated by the schema. */
export interface Tool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: ZodRawShape;
  readonly annotations: ToolAnnotations;
  run(args: Record<string, unknown>): Promise<CallToolResult>;
}
