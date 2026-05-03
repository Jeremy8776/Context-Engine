// @ts-check

const http = require('http');

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_EMBED_MODEL = process.env.CE_EMBED_MODEL || 'nomic-embed-text';

/**
 * @typedef {Object} EmbedOptions
 * @property {string=} baseUrl
 * @property {string=} model
 * @property {number=} timeoutMs
 *
 * @typedef {Object} EmbedResult
 * @property {boolean} ok
 * @property {number[][]} vectors
 * @property {string} model
 * @property {string | null} error
 */

/**
 * @param {EmbedOptions=} options
 */
async function checkOllamaEmbeddings(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_OLLAMA_URL;
  const model = options.model || DEFAULT_EMBED_MODEL;
  try {
    const data = await requestJson(`${baseUrl}/api/tags`, null, options.timeoutMs);
    const models = Array.isArray(data.models) ? data.models : [];
    const available = models.some(/** @param {{ name?: string, model?: string }} item */ (item) => item?.name === model || item?.model === model);
    return { ok: available, model, baseUrl, error: available ? null : `${model} is not installed in Ollama` };
  } catch (e) {
    return { ok: false, model, baseUrl, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string[]} texts
 * @param {EmbedOptions=} options
 * @returns {Promise<EmbedResult>}
 */
async function embedTexts(texts, options = {}) {
  const model = options.model || DEFAULT_EMBED_MODEL;
  const baseUrl = options.baseUrl || DEFAULT_OLLAMA_URL;
  if (!texts.length) return { ok: true, vectors: [], model, error: null };

  try {
    const vectors = [];
    for (const text of texts) {
      const data = await requestJson(`${baseUrl}/api/embeddings`, { model, prompt: text }, options.timeoutMs);
      if (!Array.isArray(data.embedding)) throw new Error('Ollama returned no embedding vector');
      vectors.push(data.embedding);
    }
    return { ok: true, vectors, model, error: null };
  } catch (e) {
    return { ok: false, vectors: [], model, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} url
 * @param {Record<string, unknown> | null} body
 * @param {number=} timeoutMs
 * @returns {Promise<any>}
 */
function requestJson(url, body, timeoutMs = 5000) {
  const target = new URL(url);
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: payload ? 'POST' : 'GET',
      timeout: timeoutMs,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : undefined,
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Ollama returned ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Ollama returned invalid JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Ollama request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { checkOllamaEmbeddings, embedTexts, DEFAULT_EMBED_MODEL, DEFAULT_OLLAMA_URL };
