import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DocsLibrary } from '../../src/docs/DocsLibrary.js';
import { promptsFor } from '../../src/prompts/promptsFor.js';
import { DocsResources } from '../../src/resources/DocsResources.js';
import type { ServerParts } from '../../src/server/ServerFactory.js';
import type { Tool } from '../../src/tools/Tool.js';
import { fakeDocs } from './FakeSite.js';

/** A real MCP client connected to `server` in memory, as an AI client would be. */
export async function connectClient(server: McpServer): Promise<{ client: Client; call: (name: string, args?: Record<string, unknown>) => Promise<CallToolResult> }> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { client, call };
}

/** The text of a tool result. */
export function textOf(result: CallToolResult): string {
  return result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
}

/** The server parts of a test: the given tools, every prompt and the docs resources of the fake site. */
export function partsWith(tools: readonly Tool[], signedIn: boolean, docs: DocsLibrary = fakeDocs().docs): ServerParts {
  return { tools, prompts: promptsFor(signedIn), docs: new DocsResources(docs) };
}
