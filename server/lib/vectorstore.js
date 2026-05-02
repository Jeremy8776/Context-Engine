// @ts-check

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const DEFAULT_VECTOR_FILE = path.join(DATA_DIR, 'vectors.json');

/**
 * @typedef {import('./chunker').SkillChunk & { vector: number[] }} VectorRecord
 * @typedef {{ version: string, updatedAt: string | null, model: string | null, records: VectorRecord[] }} VectorStore
 */

/**
 * @param {string=} filePath
 * @returns {VectorStore}
 */
function loadVectorStore(filePath = DEFAULT_VECTOR_FILE) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeStore(data);
  } catch {
    return emptyStore();
  }
}

/**
 * @param {VectorStore} store
 * @param {string=} filePath
 */
function saveVectorStore(store, filePath = DEFAULT_VECTOR_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

/**
 * @param {VectorStore} store
 * @param {VectorRecord[]} records
 * @param {string} model
 * @returns {VectorStore}
 */
function upsertVectors(store, records, model) {
  const next = normalizeStore(store);
  const byId = new Map(next.records.map(record => [record.id, record]));
  records.forEach(record => byId.set(record.id, record));
  next.records = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  next.model = model;
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * @param {VectorRecord[]} records
 * @param {string} model
 * @returns {VectorStore}
 */
function replaceVectors(records, model) {
  return {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    model,
    records: [...records].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * @param {VectorStore} store
 * @param {number[]} queryVector
 * @param {{ limit?: number, skillId?: string }=} options
 */
function searchVectors(store, queryVector, options = {}) {
  const limit = options.limit || 10;
  return normalizeStore(store).records
    .filter(record => !options.skillId || record.skillId === options.skillId)
    .map(record => ({ ...record, score: cosineSimilarity(queryVector, record.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cosineSimilarity(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (!aMag || !bMag) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function emptyStore() {
  return { version: '1.0', updatedAt: null, model: null, records: [] };
}

/**
 * @param {unknown} data
 * @returns {VectorStore}
 */
function normalizeStore(data) {
  if (!data || typeof data !== 'object') return emptyStore();
  const store = /** @type {Partial<VectorStore>} */ (data);
  return {
    version: store.version || '1.0',
    updatedAt: store.updatedAt || null,
    model: store.model || null,
    records: Array.isArray(store.records) ? store.records.filter(isVectorRecord) : [],
  };
}

/**
 * @param {unknown} value
 * @returns {value is VectorRecord}
 */
function isVectorRecord(value) {
  if (!value || typeof value !== 'object') return false;
  const record = /** @type {Partial<VectorRecord>} */ (value);
  return !!(record.id && record.skillId && record.text && Array.isArray(record.vector));
}

module.exports = {
  DEFAULT_VECTOR_FILE,
  loadVectorStore,
  saveVectorStore,
  upsertVectors,
  replaceVectors,
  searchVectors,
  cosineSimilarity,
};
