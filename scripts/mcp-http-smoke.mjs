// mcp-http-smoke.mjs — validates the remote-ready Streamable HTTP MCP adapter.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CE_PORT = process.env.CE_HTTP_SMOKE_CE_PORT || '3861';
const MCP_PORT = process.env.CE_HTTP_SMOKE_MCP_PORT || '3862';
const PASSWORD = 'ce-smoke-passphrase';
const REDIRECT_URI = 'http://127.0.0.1/callback';

process.env.CE_PORT = CE_PORT;

const { startServer } = require(path.join(APP_DIR, 'server/server.js'));
const httpServer = startServer({ port: Number(CE_PORT), refresh: false });
await new Promise((resolve) => httpServer.once('listening', resolve));

const child = spawn(process.execPath, [path.join(APP_DIR, 'mcp-http-server.mjs')], {
  cwd: APP_DIR,
  env: {
    ...process.env,
    CE_HOST: '127.0.0.1',
    CE_PORT,
    MCP_HTTP_HOST: '127.0.0.1',
    MCP_HTTP_PORT: MCP_PORT,
    MCP_OAUTH_PASSWORD: PASSWORD,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`mcp-http-server exited early: ${stderr}`);
    try {
      const res = await fetch(`http://127.0.0.1:${MCP_PORT}/health`);
      if (res.ok) return;
    } catch {
      // Server is not listening yet; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`mcp-http-server did not become healthy: ${stderr}`);
}

const failures = [];
function pass(msg) {
  console.log(`ok  ${msg}`);
}
function fail(msg, err) {
  const detail = err ? ` — ${err.message || err}` : '';
  console.error(`fail ${msg}${detail}`);
  failures.push(msg);
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function getOAuthToken() {
  const base = `http://127.0.0.1:${MCP_PORT}`;
  const metadata = await fetch(`${base}/.well-known/oauth-protected-resource`).then((res) => res.json());
  if (!metadata.authorization_servers?.length) fail('oauth: protected resource metadata missing auth server');
  else pass('oauth: protected resource metadata');

  const authServer = await fetch(`${base}/.well-known/oauth-authorization-server`).then((res) => res.json());
  if (!authServer.registration_endpoint || !authServer.token_endpoint) {
    fail('oauth: authorization server metadata incomplete');
  } else {
    pass('oauth: authorization server metadata');
  }

  const registration = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Context Engine HTTP Smoke',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  }).then((res) => res.json());
  if (!registration.client_id) fail('oauth: registration did not return client_id');
  else pass('oauth: dynamic client registration');

  const { verifier, challenge } = pkcePair();
  const authUrl = new URL(`${base}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', registration.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('resource', `${base}/mcp`);
  authUrl.searchParams.set('state', 'smoke');
  const page = await fetch(authUrl);
  if (page.ok) pass('oauth: authorization page');
  else fail(`oauth: authorization page returned ${page.status}`);

  const approveBody = new URLSearchParams(authUrl.searchParams);
  approveBody.set('password', PASSWORD);
  const approval = await fetch(`${base}/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: approveBody,
    redirect: 'manual',
  });
  const location = approval.headers.get('location') || '';
  const code = location ? new URL(location).searchParams.get('code') : '';
  if (approval.status === 302 && code) pass('oauth: authorization code');
  else fail(`oauth: expected redirect with code, got ${approval.status}`);

  const tokenRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
      resource: `${base}/mcp`,
    }),
  }).then((res) => res.json());
  if (!tokenRes.access_token) fail('oauth: token endpoint did not return access_token');
  else pass('oauth: token exchange');
  return tokenRes.access_token;
}

let client;
try {
  await waitForHealth();
  pass('server: health');

  const unauth = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', body: '{}' });
  if (unauth.status === 401 && unauth.headers.get('www-authenticate')?.includes('resource_metadata')) {
    pass('auth: advertises OAuth metadata on missing token');
  } else fail(`auth: expected 401, got ${unauth.status}`);

  const token = await getOAuthToken();

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${MCP_PORT}/mcp`), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  client = new Client({ name: 'context-engine-http-smoke', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  pass('connect: streamable http handshake');

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  for (const expected of [
    'context_engine_get_skill',
    'context_engine_list_skills',
    'context_engine_search',
    'context_engine_status',
  ]) {
    if (!names.includes(expected)) fail(`tools/list missing ${expected}`);
  }
  if (!failures.length) pass(`tools/list: ${names.length} tools`);

  const status = await client.callTool({ name: 'context_engine_status', arguments: {} });
  if (status.isError) fail('call: context_engine_status returned isError');
  else pass('call: context_engine_status');

  const search = await client.callTool({
    name: 'context_engine_search',
    arguments: { query: 'context engine', limit: 3 },
  });
  if (search.isError) {
    // Index may be empty in smoke; only fail on transport-level errors.
    const text = search.content?.[0]?.text || '';
    if (/CE_UNREACHABLE|TOOL_ERROR/.test(text) && !/index/i.test(text)) {
      fail(`call: context_engine_search transport error — ${text.slice(0, 160)}`);
    } else {
      pass('call: context_engine_search (empty/unbuilt index tolerated)');
    }
  } else {
    pass('call: context_engine_search');
  }

  const skills = await client.callTool({
    name: 'context_engine_list_skills',
    arguments: { activeOnly: false },
  });
  if (skills.isError) fail('call: context_engine_list_skills returned isError');
  else pass('call: context_engine_list_skills');
} catch (e) {
  fail('fatal', e);
} finally {
  try {
    await client?.close();
  } catch {
    // The child process may already be closing; ignore shutdown races.
  }
  child.kill();
  httpServer.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nall checks passed');
}
