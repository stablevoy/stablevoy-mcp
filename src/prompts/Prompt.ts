import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

/**
 * One MCP prompt (spec SPEC-mcp-prompts-resources 5): a template the user picks in the client. It returns one user
 * message telling the assistant which tools to call and what to report. Arguments arrive validated by `args`; a value
 * outside it is refused by the server with the allowed values, never replaced.
 */
export interface Prompt {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly args: ZodRawShape;
  render(args: Readonly<Record<string, unknown>>): GetPromptResult;
}
