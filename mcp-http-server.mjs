// @ts-check

// mcp-http-server.mjs — Context Engine Streamable HTTP MCP bridge.
//
// This is the remote-ready adapter for hosts that cannot spawn local stdio
// MCP servers. Put it behind HTTPS before exposing it outside the machine.

import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createOAuthProvider } from './mcp-oauth.mjs';
import { CE_BASE, createContextEngineMcpServer } from './mcp-tools.mjs';

const HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MCP_HTTP_PORT || '3850', 10);
const TOKEN = process.env.MCP_HTTP_TOKEN || '';
const OAUTH_PASSWORD = process.env.MCP_OAUTH_PASSWORD || '';
const oauth = OAUTH_PASSWORD ? createOAuthProvider({ password: OAUTH_PASSWORD }) : null;

// Refuse to bind to a non-loopback interface without auth. This is the most
// common foot-gun: a user runs `MCP_HTTP_HOST=0.0.0.0 npm run mcp:http` to
// expose the broker via tunnel, forgets to set MCP_HTTP_TOKEN or
// MCP_OAUTH_PASSWORD, and exposes every CE tool to the open internet.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
if (!LOOPBACK_HOSTS.has(String(HOST).toLowerCase()) && !oauth && !TOKEN) {
  process.stderr.write(
    `Refusing to bind MCP HTTP server on ${HOST} with no auth. ` +
      `Set MCP_OAUTH_PASSWORD (recommended) or MCP_HTTP_TOKEN, or bind to 127.0.0.1.\n`,
  );
  process.exit(2);
}

// CORS is intentionally `*`: this adapter is consumed by remote MCP clients
// (ChatGPT developer connector, Claude account-level connector) which do not
// share an origin with CE. Auth is bearer-in-header; cookies are never used,
// so wildcard origin is safe here. Do NOT add `access-control-allow-credentials`.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {Record<string, string>} [extraHeaders]
 */
function writeJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

/** @param {import('http').ServerResponse} res */
function writeNoContent(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

/** @param {import('http').IncomingMessage} req */
function isAuthorized(req) {
  if (oauth) return oauth.validate(req);
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function rejectUnauthorized(req, res) {
  if (oauth) {
    oauth.challenge(req, res);
    return;
  }
  writeJson(res, 401, { ok: false, error: 'Missing or invalid bearer token.' });
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleMcp(req, res) {
  if (!isAuthorized(req)) {
    rejectUnauthorized(req, res);
    return;
  }
  const server = createContextEngineMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (e) {
    if (!res.headersSent) {
      writeJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
        id: null,
      });
    }
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function route(req, res) {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (req.method === 'OPTIONS') {
    writeNoContent(res);
    return;
  }
  if (oauth && url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    writeJson(res, 200, oauth.protectedResourceMetadata(req));
    return;
  }
  if (oauth && url.pathname.startsWith('/.well-known/oauth-authorization-server')) {
    writeJson(res, 200, oauth.authorizationServerMetadata(req));
    return;
  }
  if (oauth && url.pathname === '/register' && req.method === 'POST') {
    await oauth.register(req, res);
    return;
  }
  if (oauth && url.pathname === '/authorize' && req.method === 'GET') {
    oauth.authorizePage(req, res, url.searchParams);
    return;
  }
  if (oauth && url.pathname === '/authorize' && req.method === 'POST') {
    await oauth.authorize(req, res);
    return;
  }
  if (oauth && url.pathname === '/token' && req.method === 'POST') {
    await oauth.token(req, res);
    return;
  }
  if (url.pathname === '/health') {
    writeJson(res, 200, {
      ok: true,
      transport: 'streamable-http',
      ceBase: CE_BASE,
      auth: oauth ? 'oauth' : TOKEN ? 'bearer' : 'none',
    });
    return;
  }
  if (url.pathname === '/mcp') {
    handleMcp(req, res).catch((e) => {
      if (!res.headersSent)
        writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return;
  }
  writeJson(res, 404, { ok: false, error: 'Not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!res.headersSent)
      writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  });
});

server.listen(PORT, HOST, () => {
  const auth = oauth ? 'oauth' : TOKEN ? 'bearer' : 'none';
  process.stderr.write(
    `context-engine HTTP MCP server listening on http://${HOST}:${PORT}/mcp (auth=${auth}, CE_BASE=${CE_BASE})\n`,
  );
  if (oauth) process.stderr.write('OAuth consent passphrase is set with MCP_OAUTH_PASSWORD.\n');
});
