import { z } from 'zod';

/** The optional `store` argument every store-bound tool takes (spec SPEC-mcp-server 3.3, 0). */
export const storeArgument = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe('Store id or exact store name from list_stores. Needed only when several stores are connected.');
