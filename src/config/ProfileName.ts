import { McpConfigError } from './McpConfigError.js';

const PROFILE = /^[a-z0-9_-]{1,32}$/;
export const DEFAULT_PROFILE = 'default';

/** A credentials profile name: 1 to 32 lowercase letters, digits, - or _. It becomes a file name. */
export function profileName(value: string | undefined): string {
  if (value === undefined || value === '') return DEFAULT_PROFILE;
  if (!PROFILE.test(value)) throw new McpConfigError(`Profile "${value}" must be 1 to 32 lowercase letters, digits, - or _`);
  return value;
}
