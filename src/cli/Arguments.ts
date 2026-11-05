import { McpConfigError } from '../config/McpConfigError.js';
import { profileName } from '../config/ProfileName.js';

export type Command =
  | { readonly kind: 'serve' }
  | { readonly kind: 'login'; readonly profile: string | null; readonly name: string | null }
  | { readonly kind: 'logout'; readonly profile: string | null }
  | { readonly kind: 'stores'; readonly profile: string | null }
  | { readonly kind: 'stores-remove'; readonly profile: string | null; readonly store: string }
  | { readonly kind: 'help' };

export const USAGE = `Usage:
  npx stablevoy-mcp                      run the MCP server (what an MCP client starts)
  npx stablevoy-mcp login [--name <computer>] [--profile <name>]
                                         approve this computer for your stores in the browser
  npx stablevoy-mcp stores [--profile <name>]          list the stores of a profile
  npx stablevoy-mcp stores remove <store> [--profile <name>]
                                         revoke the key of one store and drop it
  npx stablevoy-mcp logout [--profile <name>]          revoke every key of a profile`;

/** The command line, strictly: an unknown command or option is an error, never ignored. */
export function parseArguments(argv: readonly string[]): Command {
  const words: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--profile' || arg === '--name') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new McpConfigError(`${arg} needs a value`);
      options.set(arg, value);
      i++;
    } else if (arg.startsWith('--')) {
      throw new McpConfigError(`Unknown option ${arg}\n${USAGE}`);
    } else words.push(arg);
  }
  const profile = options.has('--profile') ? profileName(options.get('--profile')) : null;
  const name = options.get('--name') ?? null;
  if (name !== null && words[0] !== 'login') throw new McpConfigError(`--name is only for login\n${USAGE}`);
  const [command, sub, store, ...rest] = words;
  if (command === undefined) {
    if (profile !== null) throw new McpConfigError('The server reads the profile from STABLEVOY_MCP_PROFILE, not --profile');
    return { kind: 'serve' };
  }
  if (command === 'login' && sub === undefined) return { kind: 'login', profile, name };
  if (command === 'logout' && sub === undefined) return { kind: 'logout', profile };
  if (command === 'stores' && sub === undefined) return { kind: 'stores', profile };
  if (command === 'stores' && sub === 'remove' && store !== undefined && rest.length === 0) return { kind: 'stores-remove', profile, store };
  throw new McpConfigError(`Unknown command "${words.join(' ')}"\n${USAGE}`);
}
