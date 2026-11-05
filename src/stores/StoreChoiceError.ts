/** The `store` argument names no store, or several stores and none was named. Told to the model, never guessed. */
export class StoreChoiceError extends Error {
  override readonly name = 'StoreChoiceError';
}
