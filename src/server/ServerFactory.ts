import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '../tools/Tool.js';

export const SERVER_INSTRUCTIONS =
  'Stablevoy is a non-custodial USDT and USDC payment gateway. These tools create invoices to receive money, cancel unpaid ones and read stores and invoices. They cannot move funds or change any setting: payout addresses, webhooks, limits, keys and stores are changed by the merchant in the Stablevoy dashboard. Amounts are US dollars as decimal strings.';

/** The MCP server with the given tools; the composition root decides which (read-only mode leaves create_invoice and cancel_invoice out). */
export function createServer(name: string, version: string, tools: readonly Tool[]): McpServer {
  const server = new McpServer({ name, version }, { instructions: SERVER_INSTRUCTIONS });
  for (const tool of tools) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations }, (args: Record<string, unknown>) => tool.run(args));
  }
  return server;
}
