#!/usr/bin/env node
// Composition root (excluded from unit coverage; scripts/smoke.js runs the built bin over stdio).
import { homedir, hostname } from 'node:os';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Stablevoy, StablevoyConnect } from 'stablevoy';
import { Cli } from './cli/Cli.js';
import { configFrom } from './config/Config.js';
import { McpConfigError } from './config/McpConfigError.js';
import { configDir } from './credentials/ConfigDir.js';
import { CredentialStore } from './credentials/CredentialStore.js';
import { systemBrowserOpener } from './login/BrowserOpener.js';
import { sdkKeyRevoker } from './login/KeyRevoker.js';
import { LOGIN_TIMEOUT_MS, LoginCommand } from './login/LoginCommand.js';
import { LogoutCommand } from './login/LogoutCommand.js';
import { LoopbackListener } from './login/LoopbackListener.js';
import { StoresCommand } from './login/StoresCommand.js';
import { VERSION } from './version.js';

const out = (line: string): void => void process.stderr.write(`${line}\n`);
const userAgentSuffix = `stablevoy-mcp/${VERSION}`;

try {
  const config = configFrom(process.env);
  const credentials = new CredentialStore(configDir(process.env, process.platform, homedir()));
  const revoke = sdkKeyRevoker({ baseUrl: config.apiUrl, userAgentSuffix });
  const cli = new Cli({
    config,
    version: VERSION,
    hostname: hostname(),
    credentials,
    login: new LoginCommand({
      credentials,
      connect: StablevoyConnect.create({ baseUrl: config.apiUrl, userAgentSuffix }),
      revoke,
      listen: () => LoopbackListener.start(),
      openBrowser: systemBrowserOpener(process.platform),
      connectUrl: config.connectUrl,
      out,
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),
    logout: new LogoutCommand({ credentials, revoke, out }),
    stores: new StoresCommand({ credentials, revoke, out }),
    sdkFor: (apiKey) => Stablevoy.create({ apiKey, baseUrl: config.apiUrl, userAgentSuffix }),
    serve: (server) => server.connect(new StdioServerTransport()),
    out,
  });
  process.exitCode = await cli.run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof McpConfigError)) throw error;
  out(error.message);
  process.exitCode = 1;
}
