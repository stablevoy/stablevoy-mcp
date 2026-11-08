import type { DocsLibrary } from '../docs/DocsLibrary.js';
import { SignedOutStores } from '../stores/SignedOutStores.js';
import type { StoreClients } from '../stores/StoreClients.js';
import type { StoreDirectory } from '../stores/StoreDirectory.js';
import { CancelInvoiceTool } from '../tools/CancelInvoiceTool.js';
import { CreateInvoiceTool } from '../tools/CreateInvoiceTool.js';
import { GetDocTool } from '../tools/GetDocTool.js';
import { GetInvoiceTool } from '../tools/GetInvoiceTool.js';
import { GetStoreTool } from '../tools/GetStoreTool.js';
import { ListInvoicesTool } from '../tools/ListInvoicesTool.js';
import { ListStoresTool } from '../tools/ListStoresTool.js';
import { ListUnmatchedTransfersTool } from '../tools/ListUnmatchedTransfersTool.js';
import { SearchDocsTool } from '../tools/SearchDocsTool.js';
import { SummarizePaymentsTool } from '../tools/SummarizePaymentsTool.js';
import { SignedOutTool } from '../tools/SignedOutTool.js';
import type { Tool } from '../tools/Tool.js';
import { NOT_SIGNED_IN } from './SignInNotice.js';

/**
 * Every tool (spec SPEC-mcp-prompts-resources 2). With a store key (stores set) the store tools work on its stores.
 * Without one they are still listed, wrapped in SignedOutTool, so they answer not_signed_in instead of calling the API;
 * the docs tools work either way and then say under each result how to sign in. Read-only mode
 * (STABLEVOY_MCP_READ_ONLY=true) does not register create_invoice and cancel_invoice at all.
 */
export function toolsFor(stores: StoreClients | null, readOnly: boolean, docs: DocsLibrary): Tool[] {
  const directory: StoreDirectory = stores ?? new SignedOutStores();
  const reads: Tool[] = [
    new ListStoresTool(directory),
    new GetStoreTool(directory),
    new GetInvoiceTool(directory),
    new ListInvoicesTool(directory),
    new SummarizePaymentsTool(directory),
    new ListUnmatchedTransfersTool(directory),
  ];
  const storeTools = readOnly ? reads : [...reads, new CreateInvoiceTool(directory), new CancelInvoiceTool(directory)];
  const footer = stores === null ? NOT_SIGNED_IN : null;
  const docsTools: Tool[] = [new SearchDocsTool(docs, footer), new GetDocTool(docs, footer)];
  return [...(stores === null ? storeTools.map((tool) => new SignedOutTool(tool)) : storeTools), ...docsTools];
}
