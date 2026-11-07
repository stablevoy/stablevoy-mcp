import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '../tools/Tool.js';
import { NOT_SIGNED_IN } from './SignInNotice.js';

export const SERVER_INSTRUCTIONS =
  'Stablevoy is a non-custodial USDT and USDC payment gateway. These tools create invoices to receive money, cancel unpaid ones, read stores and invoices, sum up payments for a period, list transfers that matched no invoice and search the Stablevoy documentation. They cannot move funds or change any setting: payout addresses, webhooks, limits, keys and stores are changed by the merchant in the Stablevoy dashboard. Amounts are US dollars as decimal strings.';

/** The instructions for a server with a store key, or the plain statement that it has none and offers the docs only. */
export function instructionsFor(signedIn: boolean): string {
  return signedIn ? SERVER_INSTRUCTIONS : `${SERVER_INSTRUCTIONS} ${NOT_SIGNED_IN}`;
}

/** The MCP server with the given tools; the composition root decides which (read-only mode leaves create_invoice and cancel_invoice out). */
export function createServer(name: string, version: string, tools: readonly Tool[], signedIn: boolean): McpServer {
  const server = new McpServer({ name, version }, { instructions: instructionsFor(signedIn) });
  for (const tool of tools) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations }, (args: Record<string, unknown>) => tool.run(args));
  }
  return server;
}
