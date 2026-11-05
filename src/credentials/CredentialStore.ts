import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpConfigError } from '../config/McpConfigError.js';
import type { ProfileCredentials, StoredKey } from './StoredKey.js';

const FORMAT = 1;

/**
 * The keys of a login, one file per profile in the user's config folder, readable by the user only (folder 0700, file
 * 0600 where the OS has modes). Written to a temporary file and renamed, so a crash never leaves half a file.
 */
export class CredentialStore {
  constructor(private readonly dir: string) {}

  fileOf(profile: string): string {
    return path.join(this.dir, `${profile}.json`);
  }

  async read(profile: string): Promise<ProfileCredentials | null> {
    let raw: string;
    try {
      raw = await readFile(this.fileOf(profile), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return CredentialStore.parse(raw, this.fileOf(profile));
  }

  async write(profile: string, credentials: ProfileCredentials): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const file = this.fileOf(profile);
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ format: FORMAT, ...credentials }, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
  }

  async remove(profile: string): Promise<void> {
    await rm(this.fileOf(profile), { force: true });
  }

  private static parse(raw: string, file: string): ProfileCredentials {
    const broken = new McpConfigError(`${file} is not a stablevoy-mcp credentials file. Delete it and run npx stablevoy-mcp login again.`);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw broken;
    }
    if (typeof data !== 'object' || data === null) throw broken;
    const { format, label, keys } = data as Record<string, unknown>;
    if (format !== FORMAT || typeof label !== 'string' || !Array.isArray(keys) || keys.length === 0) throw broken;
    const parsed: StoredKey[] = [];
    for (const key of keys as unknown[]) {
      const { storeId, storeName, apiKey } = (typeof key === 'object' && key !== null ? key : {}) as Record<string, unknown>;
      if (typeof storeId !== 'string' || typeof storeName !== 'string' || typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) throw broken;
      parsed.push({ storeId, storeName, apiKey });
    }
    return { label, keys: parsed };
  }
}
