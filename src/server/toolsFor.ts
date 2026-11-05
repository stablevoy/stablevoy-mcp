import type { StoreClients } from '../stores/StoreClients.js';
import { CreateInvoiceTool } from '../tools/CreateInvoiceTool.js';
import { GetInvoiceTool } from '../tools/GetInvoiceTool.js';
import { GetStoreTool } from '../tools/GetStoreTool.js';
import { ListInvoicesTool } from '../tools/ListInvoicesTool.js';
import { ListStoresTool } from '../tools/ListStoresTool.js';
import type { Tool } from '../tools/Tool.js';

/** Every tool; read-only mode (STABLEVOY_MCP_READ_ONLY=true) does not register create_invoice at all. */
export function toolsFor(stores: StoreClients, readOnly: boolean): Tool[] {
  const reads: Tool[] = [new ListStoresTool(stores), new GetStoreTool(stores), new GetInvoiceTool(stores), new ListInvoicesTool(stores)];
  return readOnly ? reads : [...reads, new CreateInvoiceTool(stores)];
}
