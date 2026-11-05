import path from 'node:path';

/** The per-user config folder of this OS, where the login keeps its keys (spec SPEC-mcp-server 10.2). */
export function configDir(env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform, home: string): string {
  if (platform === 'win32') return path.win32.join(env['APPDATA'] ?? path.win32.join(home, 'AppData', 'Roaming'), 'stablevoy-mcp');
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', 'stablevoy-mcp');
  const xdg = env['XDG_CONFIG_HOME'];
  return path.posix.join(xdg !== undefined && xdg !== '' ? xdg : path.posix.join(home, '.config'), 'stablevoy-mcp');
}
