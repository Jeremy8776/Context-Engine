// @ts-check

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const DEFAULT_VECTOR_FILE = path.join(DATA_DIR, 'vectors.json');
const INDEX_STALE_FILE = path.join(DATA_DIR, 'index-stale.json');

/**
 * Mark the vector index as stale. The next /api/index/status response will
 * carry { stale: true, staleReason, staleSince } so the dashboard + onboarding
 * surfaces can prompt for a rebuild. Skill-source mutations (link / unlink /
 * import / sync apply) call this — the index goes out of date the moment the
 * walked skill set changes.
 *
 * @param {string=} reason   Short reason string surfaced to the user.
 */
function markIndexStale(reason) {
  try {
    if (!fs.existsSync(path.dirname(INDEX_STALE_FILE))) {
      fs.mkdirSync(path.dirname(INDEX_STALE_FILE), { recursive: true });
    }
    fs.writeFileSync(
      INDEX_STALE_FILE,
      JSON.stringify(
        {
          stale: true,
          reason: reason || 'Skill set changed',
          since: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
  } catch {
    /* best-effort — stale flag is advisory, not load-bearing */
  }
}

/** Clear the stale flag (called after a successful index rebuild). */
function clearIndexStale() {
  try {
    if (fs.existsSync(INDEX_STALE_FILE)) fs.unlinkSync(INDEX_STALE_FILE);
  } catch {
    /* best-effort */
  }
}

/**
 * Read the current stale state. Returns { stale: false } when no sidecar
 * exists; otherwise the persisted shape.
 *
 * @returns {{ stale: boolean, reason?: string, since?: string }}
 */
function getIndexStale() {
  try {
    const raw = fs.readFileSync(INDEX_STALE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.stale) return { stale: true, reason: parsed.reason, since: parsed.since };
  } catch {
    /* missing or unreadable — treat as not stale */
  }
  return { stale: false };
}

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
  const byId = new Map(next.records.map((record) => [record.id, record]));
  records.forEach((record) => byId.set(record.id, record));
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
  return normalizeStore(store)
    .records.filter((record) => !options.skillId || record.skillId === options.skillId)
    .map((record) => ({ ...record, score: cosineSimilarity(queryVector, record.vector) }))
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
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
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
  INDEX_STALE_FILE,
  loadVectorStore,
  saveVectorStore,
  upsertVectors,
  replaceVectors,
  searchVectors,
  cosineSimilarity,
  markIndexStale,
  clearIndexStale,
  getIndexStale,
};
