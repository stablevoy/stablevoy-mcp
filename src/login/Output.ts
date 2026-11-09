/** Where the CLI talks to the user: stderr, since stdout belongs to the MCP protocol when serving. */
export type Output = (line: string) => void;

/** "svk_live_4f9a" (or the older "sk_live_4f9a") of a key: its prefix and 4 characters, as the dashboard shows it, never the secret. */
export function keyPrefix(apiKey: string): string {
  const prefix = /^s(v)?k_(live|test)_/.exec(apiKey)?.[0];
  if (prefix === undefined) throw new Error('Not a store API key');
  return apiKey.slice(0, prefix.length + 4);
}
