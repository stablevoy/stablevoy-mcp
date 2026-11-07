import type { DocsLibrary } from '../docs/DocsLibrary.js';
import type { StoreClients } from '../stores/StoreClients.js';
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
import type { Tool } from '../tools/Tool.js';
import { NOT_SIGNED_IN } from './SignInNotice.js';

/**
 * Every tool. The docs tools need no key and are always there; without a store key (stores null) they are the only ones,
 * and say so under each result. Read-only mode (STABLEVOY_MCP_READ_ONLY=true) does not register create_invoice and
 * cancel_invoice at all.
 */
export function toolsFor(stores: StoreClients | null, readOnly: boolean, docs: DocsLibrary): Tool[] {
  const footer = stores === null ? NOT_SIGNED_IN : null;
  const docsTools: Tool[] = [new SearchDocsTool(docs, footer), new GetDocTool(docs, footer)];
  if (stores === null) return docsTools;
  const reads: Tool[] = [
    new ListStoresTool(stores),
    new GetStoreTool(stores),
    new GetInvoiceTool(stores),
    new ListInvoicesTool(stores),
    new SummarizePaymentsTool(stores),
    new ListUnmatchedTransfersTool(stores),
    ...docsTools,
  ];
  return readOnly ? reads : [...reads, new CreateInvoiceTool(stores), new CancelInvoiceTool(stores)];
}
