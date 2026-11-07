/** A path get_doc refuses: not a page of llms.txt. The message lists what it takes instead. */
export class UnknownDocError extends Error {
  override readonly name = 'UnknownDocError';
}
