/** A page of the Stablevoy documentation could not be read: site down, too slow, too large or not what was expected. */
export class DocsUnavailableError extends Error {
  override readonly name = 'DocsUnavailableError';
}
