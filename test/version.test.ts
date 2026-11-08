import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

describe('version', () => {
  it('is the package version, which the server reports to clients', () => {
    expect(VERSION).toBe((JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
  });

  it('has a package description npm keeps whole (255 characters) and a registry description of at most 100', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { description: string };
    const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8')) as { description: string; version: string; packages: { version: string }[] };
    expect(pkg.description.length).toBeLessThanOrEqual(255);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect([server.version, ...server.packages.map((p) => p.version)]).toEqual([VERSION, ...server.packages.map(() => VERSION)]);
  });
});
