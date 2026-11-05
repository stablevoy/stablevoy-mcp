import { createHash, randomBytes } from 'node:crypto';

/** RFC 7636 S256: a 43-character verifier from 32 random bytes and its challenge. */
export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export function pkcePair(random: (bytes: number) => Buffer = randomBytes): PkcePair {
  const verifier = random(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** The anti-forgery value echoed back with the code. */
export function randomState(random: (bytes: number) => Buffer = randomBytes): string {
  return random(16).toString('base64url');
}
