import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { Prompt } from './Prompt.js';
import { userMessage } from './PromptText.js';

/** How to start with Stablevoy from the docs, and how to connect this server; works without a key. */
export class GettingStartedPrompt implements Prompt {
  readonly name = 'getting_started';
  readonly title = 'Get started with Stablevoy';
  readonly description = 'Explains from the documentation how to start taking USDT and USDC with Stablevoy and how to connect this assistant. Needs no key.';
  readonly args = {};

  /** `signedIn`: whether this server has a store key, so the last step checks the store instead of explaining the login. */
  constructor(private readonly signedIn: boolean) {}

  render(): GetPromptResult {
    const connect = this.signedIn
      ? '2. This assistant is already connected to Stablevoy: call list_stores and then get_store for each store, and tell me whether it can accept payments and, if not, what is missing.'
      : '2. Then explain how to connect this assistant: run npx stablevoy-mcp login in a terminal, pick the stores in the browser and restart the MCP client, or set STABLEVOY_API_KEY in the MCP client config. Until then the store tools answer not_signed_in.';
    return userMessage(
      this.description,
      [
        'I want to start accepting USDT and USDC with Stablevoy.',
        '1. Use search_docs and get_doc to explain, step by step: signing in with a wallet, setting the payout wallet, creating a store, and then creating a first invoice or connecting a shop plugin.',
        connect,
        'Name the documentation pages you used with their addresses.',
      ].join('\n'),
    );
  }
}
