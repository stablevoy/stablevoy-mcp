import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ERRORS_DOC, OPENAPI_DOC } from '../docs/DocsLibrary.js';
import type { Prompt } from '../prompts/Prompt.js';
import { DOCS_RESOURCE_PREFIX, DOCS_RESOURCE_TEMPLATE, type DocsResources } from '../resources/DocsResources.js';
import type { Tool } from '../tools/Tool.js';
import { NOT_SIGNED_IN } from './SignInNotice.js';

export const SERVER_INSTRUCTIONS =
  'Stablevoy is a non-custodial USDT and USDC payment gateway. These tools create invoices to receive money, cancel unpaid ones, read stores and invoices, sum up payments for a period, list transfers that matched no invoice and search the Stablevoy documentation. They cannot move funds or change any setting: payout addresses, webhooks, limits, keys and stores are changed by the merchant in the Stablevoy dashboard. Amounts are US dollars as decimal strings.';

/** The instructions for a server with a store key, or the plain statement that it has none and offers the docs only. */
export function instructionsFor(signedIn: boolean): string {
  return signedIn ? SERVER_INSTRUCTIONS : `${SERVER_INSTRUCTIONS} ${NOT_SIGNED_IN}`;
}

/** What the server offers; the composition root decides which tools (read-only mode leaves create_invoice and cancel_invoice out). */
export interface ServerParts {
  readonly tools: readonly Tool[];
  readonly prompts: readonly Prompt[];
  readonly docs: DocsResources;
}

/** The MCP server with the given tools, prompts and documentation resources (spec SPEC-mcp-prompts-resources). */
export function createServer(name: string, version: string, parts: ServerParts, signedIn: boolean): McpServer {
  const server = new McpServer({ name, version }, { instructions: instructionsFor(signedIn) });
  for (const tool of parts.tools) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations }, (args: Record<string, unknown>) => tool.run(args));
  }
  for (const prompt of parts.prompts) {
    server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description, argsSchema: prompt.args }, (args: Record<string, unknown>) => prompt.render(args));
  }
  const { docs } = parts;
  server.registerResource(
    'docs-openapi',
    `${DOCS_RESOURCE_PREFIX}${OPENAPI_DOC}`,
    { title: 'Stablevoy API operations', description: 'Every endpoint of the Stablevoy REST API with its parameters, from the live OpenAPI document. Needs no key.', mimeType: 'text/markdown' },
    async () => ({ contents: [await docs.readFixed(OPENAPI_DOC)] }),
  );
  server.registerResource(
    'docs-errors',
    `${DOCS_RESOURCE_PREFIX}${ERRORS_DOC}`,
    { title: 'Stablevoy API error codes', description: 'Every API error code with what it means and what to do. Needs no key.', mimeType: 'text/markdown' },
    async () => ({ contents: [await docs.readFixed(ERRORS_DOC)] }),
  );
  server.registerResource(
    'docs',
    new ResourceTemplate(DOCS_RESOURCE_TEMPLATE, { list: async () => ({ resources: await docs.list() }) }),
    { title: 'Stablevoy documentation', description: 'A page of the Stablevoy documentation as Markdown, one per page listed in llms.txt. Needs no key.', mimeType: 'text/markdown' },
    async (_uri, variables) => ({ contents: [await docs.readPage(variables['page'])] }),
  );
  return server;
}
