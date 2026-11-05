import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CredentialStore } from '../src/credentials/CredentialStore.js';

describe('credentials of a login', () => {
  let dir: string;
  let store: CredentialStore;
  const saved = { label: 'laptop', keys: [{ storeId: 's1', storeName: 'Main', apiKey: 'sk_live_a' }] };

  beforeEach(async () => {
    dir = path.join(await mkdtemp(path.join(tmpdir(), 'svmcp-')), 'nested');
    store = new CredentialStore(dir);
  });

  it('writes a profile readable by the user only, reads it back and removes it', async () => {
    expect(await store.read('default')).toBeNull();
    await store.write('default', saved);
    expect(await store.read('default')).toEqual(saved);
    expect((await stat(store.fileOf('default'))).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    await store.remove('default');
    expect(await store.read('default')).toBeNull();
    await store.remove('default');
  });

  it('refuses a file it did not write instead of guessing', async () => {
    await store.write('default', saved);
    const file = store.fileOf('default');
    const good = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    for (const bad of ['not json', 'null', JSON.stringify({ ...good, format: 2 }), JSON.stringify({ ...good, keys: [] }), JSON.stringify({ ...good, keys: [{ storeId: 's1', storeName: 'Main', apiKey: 'pk_x' }] }), JSON.stringify({ ...good, keys: [null] })]) {
      await writeFile(file, bad);
      await expect(store.read('default')).rejects.toThrow('is not a stablevoy-mcp credentials file');
    }
  });

  it('passes on a read error other than a missing file', async () => {
    await writeFile(path.join(path.dirname(dir), 'nested'), 'a file where the folder should be');
    await expect(new CredentialStore(path.join(path.dirname(dir), 'nested')).read('default')).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});
