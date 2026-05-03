// @ts-check
// server.js - Context Engine HTTP server

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PORT, UI_DIR, MIME } = require('./lib/config');
const { cors, json } = require('./lib/http');
const { handleRequest } = require('./router');
const { regenerateCONTEXTmd } = require('./lib/modes');

/**
 * @returns {import('http').Server}
 */
/**
 * Async request handler. The outer http.createServer callback is sync
 * (void return) — see createContextServer for the wiring rationale.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleHttpRequest(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  try {
    const handled = await handleRequest(req, res, url);
    if (handled !== null) return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('API error:', msg);
    return json(res, { ok: false, error: msg }, 500);
  }

  const safePath = path.resolve(UI_DIR, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!safePath.startsWith(path.resolve(UI_DIR))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(safePath)) {
    const mimeMap = /** @type {Record<string, string>} */ (MIME);
    res.writeHead(200, { 'Content-Type': mimeMap[path.extname(safePath)] || 'text/plain' });
    return res.end(fs.readFileSync(safePath));
  }
  res.writeHead(404);
  res.end('Not found');
}

function createContextServer() {
  // http.createServer expects a sync (void-returning) listener. Wrap the
  // async handler and explicitly void the returned promise so we can't
  // accidentally drop a rejection — handleHttpRequest catches its own
  // errors and writes a 500, so this .catch is a true last-resort.
  return http.createServer((req, res) => {
    handleHttpRequest(req, res).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Unhandled request error:', msg);
      try { res.writeHead(500); res.end('Internal error'); } catch { /* response already sent */ }
    });
  });
}

function refreshManifest() {
  try {
    const r = regenerateCONTEXTmd();
    console.log(`CONTEXT.md regenerated - ${r.activeCount}/${r.total} skills active`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('CONTEXT.md regen failed:', msg);
  }
}

/**
 * @param {Object} options
 * @param {number=} options.port
 * @param {string=} options.host
 * @param {boolean=} options.refresh
 * @returns {import('http').Server}
 */
function startServer({ port = PORT, host = '127.0.0.1', refresh = true } = {}) {
  const server = createContextServer();
  server.listen(port, host, () => {
    console.log(`Context Engine - http://${host}:${port}`);
    if (refresh) refreshManifest();
  });
  return server;
}

if (require.main === module) startServer();

module.exports = { createContextServer, startServer };
