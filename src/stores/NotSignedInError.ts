import { NOT_SIGNED_IN_ERROR } from '../server/SignInNotice.js';

/** A store tool was called on a server with no store key. Told to the model with what to do, never an empty result. */
export class NotSignedInError extends Error {
  override readonly name = 'NotSignedInError';

  constructor() {
    super(NOT_SIGNED_IN_ERROR);
  }
}
