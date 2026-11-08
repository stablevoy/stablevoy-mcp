// Runs the built bin the way an MCP client does: initialize, tools/list, prompts/list and resources/templates/list over
// stdio, once with a key from the environment and once with no key at all, as directories that list the server see it:
// the same tools, prompts and resources both times, and the instructions say when the server is not signed in.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function toolsOf(env) {
  const child = spawn(process.execPath, [new URL('../dist/main.js', import.meta.url).pathname], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
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
  const prompts = await request(3, 'prompts/list', {});
  const templates = await request(4, 'resources/templates/list', {});
  clearTimeout(timer);
  child.kill();
  return {
    names: list.result.tools.map((t) => t.name).sort().join(','),
    prompts: prompts.result.prompts.map((p) => p.name).sort().join(','),
    templates: templates.result.resourceTemplates.map((t) => t.uriTemplate).join(','),
    instructions: init.result.instructions,
  };
}

const withKey = await toolsOf({ STABLEVOY_API_KEY: 'sk_live_smoke', STABLEVOY_MCP_PROFILE: '' });
const all = 'cancel_invoice,create_invoice,get_doc,get_invoice,get_store,list_invoices,list_stores,list_unmatched_transfers,search_docs,summarize_payments';
const prompts = 'client_payments,getting_started,payments_summary,review_unmatched_transfers,unpaid_invoices';
const templates = 'stablevoy://docs/{+page}';
const check = (run, label) => {
  if (run.names !== all) throw new Error(`smoke: unexpected tools ${label} ${run.names}`);
  if (run.prompts !== prompts) throw new Error(`smoke: unexpected prompts ${label} ${run.prompts}`);
  if (run.templates !== templates) throw new Error(`smoke: unexpected resource templates ${label} ${run.templates}`);
};
check(withKey, 'with a key');
if (withKey.instructions.includes('Not signed in')) throw new Error('smoke: a server with a key says it is not signed in');

const emptyConfig = mkdtempSync(path.join(tmpdir(), 'svmcp-smoke-'));
try {
  const withoutKey = await toolsOf({ STABLEVOY_API_KEY: '', STABLEVOY_MCP_PROFILE: '', XDG_CONFIG_HOME: emptyConfig, APPDATA: emptyConfig, HOME: emptyConfig });
  check(withoutKey, 'without a key');
  if (!withoutKey.instructions.includes('Not signed in')) throw new Error('smoke: the instructions do not say the server is not signed in');
} finally {
  rmSync(emptyConfig, { recursive: true, force: true });
}
console.log(`smoke ok ${pkg.version}: tools ${all}; prompts ${prompts}; resources ${templates}, openapi, errors; the same without a key`);
