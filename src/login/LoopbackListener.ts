import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LoginTimeout } from './LoginTimeout.js';

const DONE_PAGE = '<!doctype html><meta charset="utf-8"><title>Stablevoy</title><p>Connected. You can close this window and go back to the terminal.</p>';
const WRONG_PAGE = '<!doctype html><meta charset="utf-8"><title>Stablevoy</title><p>This link does not belong to the login that is waiting. Start npx stablevoy-mcp login again.</p>';

/**
 * Waits on 127.0.0.1 only, on a free port, for the one browser redirect that carries the code and the expected state
 * (RFC 8252, spec SPEC-mcp-server 10.2). Any other request is answered and ignored; after one good answer or the
 * timeout it closes.
 */
export class LoopbackListener {
  private constructor(
    private readonly server: Server,
    readonly returnUrl: string,
  ) {}

  static async start(): Promise<LoopbackListener> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    return new LoopbackListener(server, `http://127.0.0.1:${port}/callback`);
  }

  /** The code of the redirect whose state matches; LoginTimeout after `timeoutMs`. */
  waitForCode(state: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new LoginTimeout(`No approval arrived within ${Math.round(timeoutMs / 60_000)} minutes. Run npx stablevoy-mcp login again.`));
      }, timeoutMs);
      this.server.on('request', (request: IncomingMessage, response: ServerResponse) => {
        // A server request always has its path in url.
        const url = new URL(String(request.url), this.returnUrl);
        const code = url.searchParams.get('stablevoy_code');
        if (request.method !== 'GET' || url.pathname !== '/callback' || code === null || code === '' || url.searchParams.get('state') !== state) {
          response.writeHead(url.pathname === '/callback' ? 400 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(WRONG_PAGE);
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' }).end(DONE_PAGE, () => {
          this.close();
        });
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.server.close();
    this.server.closeAllConnections();
  }
}
