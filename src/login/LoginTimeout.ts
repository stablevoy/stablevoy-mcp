/** Nobody approved in the dashboard within the time the listener waits. */
export class LoginTimeout extends Error {
  override readonly name = 'LoginTimeout';
}
