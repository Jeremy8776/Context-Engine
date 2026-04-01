// server.js — Context Engine v3
// Dynamic Skill Discovery & Orchestrator Backend

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { PORT, UI_DIR, MIME } = require('./lib/config');
const { cors } = require('./lib/http');
const { json } = require('./lib/http');
const { handleRequest } = require('./router');
const { regenerateCONTEXTmd } = require('./lib/modes');

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API routes
  try {
    const handled = await handleRequest(req, res, url);
    if (handled !== null) return;
  } catch (e) {
    console.error('API error:', e.message);
    return json(res, { ok: false, error: e.message }, 500);
  }

  // Static file serving with path traversal protection
  const safePath = path.resolve(UI_DIR, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!safePath.startsWith(path.resolve(UI_DIR))) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(safePath)) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safePath)] || 'text/plain' });
    return res.end(fs.readFileSync(safePath));
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Context Engine v3 — http://localhost:${PORT}`);
  try {
    const r = regenerateCONTEXTmd();
    console.log(`CONTEXT.md regenerated — ${r.activeCount}/${r.total} skills active`);
  } catch(e) { console.error('CONTEXT.md regen failed:', e.message); }
});
