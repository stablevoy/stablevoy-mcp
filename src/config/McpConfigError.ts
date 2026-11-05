/** A setup the server cannot run with: reported on stderr, the process exits, no tool is served. */
export class McpConfigError extends Error {
  override readonly name = 'McpConfigError';
}
