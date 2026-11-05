import { spawn as nodeSpawn } from 'node:child_process';

/** Opens a URL in the user's browser with the OS command; false when it could not be started (the URL is printed anyway). */
export type BrowserOpener = (url: string) => Promise<boolean>;

/** The part of a spawned process the opener uses. */
export interface Spawned {
  once(event: 'error' | 'spawn', listener: () => void): unknown;
  unref(): void;
}

export type Spawn = (command: string, args: readonly string[], options: { detached: boolean; stdio: 'ignore' }) => Spawned;

export function systemBrowserOpener(platform: NodeJS.Platform, spawn: Spawn = nodeSpawn): BrowserOpener {
  return (url) =>
    new Promise<boolean>((resolve) => {
      // No shell on any OS: cmd would split the URL at its & signs.
      const [command, args] = platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.once('error', () => {
        resolve(false);
      });
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    });
}
