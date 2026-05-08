// http.js — HTTP utilities (CORS, body parser, JSON response)

// @ts-check

const { PORT } = require('./config');

const MAX_BODY = 1024 * 1024; // 1 MB

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function body(req) {
  return new Promise((resolve, reject) => {
    // Defense in depth: refuse non-JSON content types so browser "simple
    // requests" (text/plain, multipart/form-data, application/x-www-form-
    // urlencoded) cannot bypass CORS preflight to issue side-effecting calls.
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (ct && !ct.startsWith('application/json')) {
      req.resume();
      return resolve({ _parseError: true, _contentType: ct });
    }
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > MAX_BODY) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch {
        resolve({ _parseError: true });
      }
    });
  });
}

/**
 * @param {import('http').ServerResponse} res
 * @param {unknown} data
 * @param {number} status
 */
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

module.exports = { cors, body, json };
