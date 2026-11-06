import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LoginTimeout } from './LoginTimeout.js';

/** What the result page on the site shows (spec SPEC-mcp-login-done-page 2.1). */
export type LoginResult = 'connected' | 'failed';

/**
 * Waits on 127.0.0.1 only, on a free port, for the one browser redirect that carries the code and the expected state
 * (RFC 8252, spec SPEC-mcp-server 10.2). The browser request that brought the code is held until the login knows its
 * result, then sent on to the result page of the site (spec SPEC-mcp-login-done-page 2.2). A callback with the wrong
 * state goes to the "mismatch" result and the login keeps waiting; any other path is a 404.
 */
export class LoopbackListener {
  private held: ServerResponse | null = null;
  private settled = false;

  private constructor(
    private readonly server: Server,
    readonly returnUrl: string,
    private readonly doneUrl: string,
  ) {}

  static async start(doneUrl: string): Promise<LoopbackListener> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    return new LoopbackListener(server, `http://127.0.0.1:${port}/callback`, doneUrl);
  }

  /** The code of the redirect whose state matches; LoginTimeout after `timeoutMs`. Call finish() once it is used. */
  waitForCode(state: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settled = true;
        this.close();
        reject(new LoginTimeout(`No approval arrived within ${Math.round(timeoutMs / 60_000)} minutes. Run npx stablevoy-mcp login again.`));
      }, timeoutMs);
      this.server.on('request', (request: IncomingMessage, response: ServerResponse) => {
        // A server request always has its path in url.
        const url = new URL(String(request.url), this.returnUrl);
        if (request.method !== 'GET' || url.pathname !== '/callback') {
          response.writeHead(404, { connection: 'close' }).end();
          return;
        }
        const code = url.searchParams.get('stablevoy_code');
        if (this.settled || code === null || code === '' || url.searchParams.get('state') !== state) {
          this.redirect(response, 'mismatch');
          return;
        }
        this.settled = true;
        this.held = response;
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  /** Sends the held browser request to the result page. */
  finish(result: LoginResult): void {
    const response = this.held;
    this.held = null;
    if (response !== null) this.redirect(response, result);
  }

  /** Stops listening; a browser request still held learns that the login failed. */
  close(): void {
    this.finish('failed');
    this.server.close();
    this.server.closeIdleConnections();
  }

  private redirect(response: ServerResponse, result: LoginResult | 'mismatch'): void {
    const location = new URL(this.doneUrl);
    location.searchParams.set('result', result);
    response.writeHead(302, { location: location.toString(), 'cache-control': 'no-store', connection: 'close' }).end();
  }
}
