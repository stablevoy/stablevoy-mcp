/** Where the CLI talks to the user: stderr, since stdout belongs to the MCP protocol when serving. */
export type Output = (line: string) => void;

/** "sk_live_4f9a" of a key: enough to find it in the dashboard, never the secret. */
export function keyPrefix(apiKey: string): string {
  return apiKey.slice(0, 12);
}
