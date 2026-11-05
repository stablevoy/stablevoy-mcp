// Runs the built bin the way an MCP client does: initialize and tools/list over stdio, with a key from the environment.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const child = spawn(process.execPath, [new URL('../dist/main.js', import.meta.url).pathname], {
  env: { ...process.env, STABLEVOY_API_KEY: 'sk_live_smoke', STABLEVOY_MCP_PROFILE: '' },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
let buffer = '';
const answers = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
    const message = JSON.parse(buffer.slice(0, at));
    buffer = buffer.slice(at + 1);
    if (message.id !== undefined) answers.get(message.id)?.(message);
  }
});
const request = (id, method, params) => new Promise((resolve) => (answers.set(id, resolve), send({ id, method, params })));
const timer = setTimeout(() => {
  console.error('smoke: no answer in 10 seconds');
  process.exit(1);
}, 10_000);

const init = await request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
if (init.result?.serverInfo?.name !== 'stablevoy-mcp' || init.result.serverInfo.version !== pkg.version) throw new Error(`smoke: unexpected server info ${JSON.stringify(init.result?.serverInfo)}`);
send({ method: 'notifications/initialized' });
const list = await request(2, 'tools/list', {});
const names = list.result.tools.map((t) => t.name).sort().join(',');
if (names !== 'create_invoice,get_invoice,get_store,list_invoices,list_stores') throw new Error(`smoke: unexpected tools ${names}`);
clearTimeout(timer);
child.kill();
console.log(`smoke ok ${pkg.version}: ${names}`);
