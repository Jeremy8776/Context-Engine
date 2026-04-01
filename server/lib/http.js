// http.js — HTTP utilities (CORS, body parser, JSON response)

const { PORT } = require('./config');

const MAX_BODY = 1024 * 1024; // 1 MB

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function body(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => {
      d += c;
      if (d.length > MAX_BODY) { req.destroy(); reject(new Error('Payload too large')); }
    });
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ _parseError: true }); } });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

module.exports = { cors, body, json };
