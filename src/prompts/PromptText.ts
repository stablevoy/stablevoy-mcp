import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/** The optional store argument of the prompts, the same rule as the tools' `store`. */
export const storePromptArgument = z.string().min(1).max(100).optional().describe('Store id or exact store name from list_stores. Leave out with one store, or for every store.');

/** `, with store "X"` for a chosen store, nothing for every store. */
export function storeClause(store: string | undefined): string {
  return store === undefined ? '' : ` with store ${JSON.stringify(store)}`;
}

/** The single user message a prompt returns. */
export function userMessage(description: string, text: string): GetPromptResult {
  return { description, messages: [{ role: 'user', content: { type: 'text', text } }] };
}

/** Said at the end of every prompt that reads a store. */
export const READ_ONLY_RULE = 'Only read: do not create or cancel anything. If a tool answers an error, show it with what it says to do.';

/** A prompt argument already checked by its schema; anything but a string or nothing is a bug and fails loudly. */
export function argText(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || typeof value === 'string') return value;
  throw new Error(`Prompt argument ${name} is not a string`);
}
