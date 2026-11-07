import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Stablevoy } from 'stablevoy';
import type { Config } from '../config/Config.js';
import { McpConfigError } from '../config/McpConfigError.js';
import type { CredentialStore } from '../credentials/CredentialStore.js';
import type { DocsLibrary } from '../docs/DocsLibrary.js';
import type { LoginCommand } from '../login/LoginCommand.js';
import type { LogoutCommand } from '../login/LogoutCommand.js';
import type { Output } from '../login/Output.js';
import type { StoresCommand } from '../login/StoresCommand.js';
import { createServer } from '../server/ServerFactory.js';
import { toolsFor } from '../server/toolsFor.js';
import { StoreClient } from '../stores/StoreClient.js';
import { StoreClients } from '../stores/StoreClients.js';
import { parseArguments, USAGE } from './Arguments.js';

export const SERVER_NAME = 'stablevoy-mcp';

/** What the CLI needs; main.ts builds the production one. */
export interface CliDeps {
  readonly config: Config;
  readonly version: string;
  readonly hostname: string;
  readonly credentials: CredentialStore;
  readonly login: LoginCommand;
  readonly logout: LogoutCommand;
  readonly stores: StoresCommand;
  /** The documentation the docs tools read; they work without a key. */
  readonly docs: DocsLibrary;
  /** An SDK client for one store key. */
  readonly sdkFor: (apiKey: string) => Stablevoy;
  /** Connects the server to its transport (stdio in production) and resolves when it is running. */
  readonly serve: (server: McpServer) => Promise<void>;
  readonly out: Output;
}

/** Runs one command line; returns the exit code. A setup problem is printed, never a stack trace or a key. */
export class Cli {
  constructor(private readonly deps: CliDeps) {}

  async run(argv: readonly string[]): Promise<number> {
    try {
      const command = parseArguments(argv);
      const profile = (p: string | null): string => p ?? this.deps.config.profile;
      switch (command.kind) {
        case 'help':
          this.deps.out(USAGE);
          return 0;
        case 'login':
          return await this.deps.login.run(profile(command.profile), command.name ?? this.deps.hostname.slice(0, 40));
        case 'logout':
          return await this.deps.logout.run(profile(command.profile));
        case 'stores':
          return await this.deps.stores.list(profile(command.profile));
        case 'stores-remove':
          return await this.deps.stores.remove(profile(command.profile), command.store);
        case 'serve': {
          const stores = await this.storeClients();
          await this.deps.serve(createServer(SERVER_NAME, this.deps.version, toolsFor(stores, this.deps.config.readOnly, this.deps.docs), stores !== null));
          return 0;
        }
      }
    } catch (error) {
      if (!(error instanceof McpConfigError)) throw error;
      this.deps.out(error.message);
      return 1;
    }
  }

  /**
   * The store keys, or null when there is no login and no STABLEVOY_API_KEY: the server then offers the docs tools only
   * and says so in its instructions (spec SPEC-mcp-docs-summary-unmatched 3.2). A broken key file still fails loudly.
   */
  private async storeClients(): Promise<StoreClients | null> {
    const { source } = this.deps.config;
    if (source.kind === 'key') return new StoreClients([new StoreClient(this.deps.sdkFor(source.apiKey), null)]);
    const saved = await this.deps.credentials.read(source.profile);
    if (saved === null) {
      this.deps.out(`No Stablevoy key: serving the documentation tools only. Run npx stablevoy-mcp login, or set STABLEVOY_API_KEY in the MCP client config.`);
      return null;
    }
    return new StoreClients(saved.keys.map((key) => new StoreClient(this.deps.sdkFor(key.apiKey), { id: key.storeId, name: key.storeName })));
  }
}
