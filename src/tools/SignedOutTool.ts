import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NotSignedInError } from '../stores/NotSignedInError.js';
import type { Tool } from './Tool.js';
import { toolError } from './ToolError.js';

/**
 * A store tool on a server without a store key (spec SPEC-mcp-prompts-resources 2): listed with its real name,
 * description, schema and annotations, so clients and directories see what the server does; every call answers the
 * not_signed_in tool error at once and never reaches the API.
 */
export class SignedOutTool implements Tool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: Tool['input'];
  readonly annotations: Tool['annotations'];

  constructor(tool: Tool) {
    this.name = tool.name;
    this.title = tool.title;
    this.description = tool.description;
    this.input = tool.input;
    this.annotations = tool.annotations;
  }

  run(): Promise<CallToolResult> {
    return Promise.resolve(toolError(new NotSignedInError()));
  }
}
