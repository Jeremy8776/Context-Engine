// @ts-check

const fs = require('fs');
const path = require('path');
const { DEDUP_FILE } = require('./config');
const { chooseKeeper, scoreChunk, tokenize } = require('./ranking');
const { cosineSimilarity } = require('./vectorstore');

const DEFAULTS = {
  duplicateThreshold: 0.93,
  relatedThreshold: 0.84,
  maxTokenBucket: 90,
  maxPairs: 2500,
};

const FILLER_TERMS = new Set([
  'assistant',
  'context',
  'help',
  'information',
  'request',
  'response',
  'task',
  'tool',
  'user',
]);

/**
 * @typedef {import('./vectorstore').VectorStore} VectorStore
 * @typedef {import('./vectorstore').VectorRecord} VectorRecord
 * @typedef {{ a: number, b: number, score: number, textScore: number, kind: 'near-duplicate' | 'related' }} SimilarityPair
 * @typedef {{ id: string, status: 'open' | 'resolved' | 'ignored', kind: 'near-duplicate' | 'related', score: number, suggestedKeepSkillId: string | null, items: DedupItem[], pairCount: number, resolution?: DedupResolution | null }} DedupCluster
 * @typedef {{ chunkId: string, skillId: string, section: string, type: string, score: number, text: string, rank: ReturnType<typeof scoreChunk> }} DedupItem
 * @typedef {{ action: string, keepSkillId?: string, note?: string, resolvedAt: string }} DedupResolution
 * @typedef {{ version: string, generatedAt: string | null, vectorUpdatedAt: string | null, model: string | null, thresholds: typeof DEFAULTS, stats: Record<string, number>, clusters: DedupCluster[], lowSpecificity: DedupItem[], resolutions: Record<string, DedupResolution>, history: Array<{ clusterId: string, previous?: DedupResolution | null, next: DedupResolution }> }} DedupReport
 */

/**
 * @param {VectorStore} store
 * @param {Partial<typeof DEFAULTS>=} options
 * @param {DedupReport | null=} previous
 * @returns {DedupReport}
 */
function generateDedupReport(store, options = {}, previous = null) {
  const thresholds = { ...DEFAULTS, ...options };
  const records = store.records || [];
  const candidates = candidatePairs(records, thresholds);
  const pairs = scorePairs(records, candidates, thresholds);
  const clusters = buildClusters(records, pairs, previous?.resolutions || {});
  const lowSpecificity = records
    .map((record) => toItem(record, 0))
    .filter(
      (item) => item.text.length > 80 && (item.rank.specificity < 0.34 || fillerDensity(item.text) > 0.3),
    )
    .sort((a, b) => a.rank.specificity - b.rank.specificity || a.skillId.localeCompare(b.skillId))
    .slice(0, 40);

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    vectorUpdatedAt: store.updatedAt,
    model: store.model,
    thresholds,
    stats: {
      chunks: records.length,
      candidatePairs: candidates.size,
      similarityPairs: pairs.length,
      clusters: clusters.length,
      nearDuplicateClusters: clusters.filter((cluster) => cluster.kind === 'near-duplicate').length,
      lowSpecificity: lowSpecificity.length,
    },
    clusters,
    lowSpecificity,
    resolutions: previous?.resolutions || {},
    history: previous?.history || [],
  };
}

/**
 * @param {string=} filePath
 * @returns {DedupReport | null}
 */
function loadDedupReport(filePath = DEDUP_FILE) {
  try {
    return normalizeReport(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * @param {DedupReport} report
 * @param {string=} filePath
 */
function saveDedupReport(report, filePath = DEDUP_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
}

/**
 * @param {DedupReport} report
 * @param {{ clusterId: string, action: string, keepSkillId?: string, note?: string }} input
 * @returns {DedupReport}
 */
function resolveDedupCluster(report, input) {
  const cluster = report.clusters.find((item) => item.id === input.clusterId);
  if (!cluster) throw new Error('Unknown dedup cluster: ' + input.clusterId);
  const action = input.action === 'reopen' ? 'reopen' : input.action === 'ignore' ? 'ignore' : 'keep-skill';
  const previous = report.resolutions[input.clusterId] || null;
  if (action === 'reopen') {
    delete report.resolutions[input.clusterId];
    cluster.status = 'open';
    cluster.resolution = null;
    report.history.push({ clusterId: input.clusterId, previous, next: makeResolution(input, action) });
    return report;
  }
  const next = makeResolution(input, action);
  report.resolutions[input.clusterId] = next;
  cluster.status = action === 'ignore' ? 'ignored' : 'resolved';
  cluster.resolution = next;
  report.history.push({ clusterId: input.clusterId, previous, next });
  return report;
}

/**
 * @param {{ keepSkillId?: string, note?: string }} input
 * @param {string} action
 * @returns {DedupResolution}
 */
function makeResolution(input, action) {
  return {
    action,
    keepSkillId: input.keepSkillId,
    note: input.note,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * @param {VectorRecord[]} records
 * @param {typeof DEFAULTS} options
 * @returns {Set<string>}
 */
function candidatePairs(records, options) {
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  const termLists = records.map((record) => rareTerms(record.text));
  termLists.forEach((terms, index) => {
    terms.forEach((term) => {
      const bucket = buckets.get(term) || [];
      if (bucket.length < options.maxTokenBucket) bucket.push(index);
      buckets.set(term, bucket);
    });
  });
  const pairs = new Set();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        if (typeof a !== 'number' || typeof b !== 'number' || records[a]?.skillId === records[b]?.skillId)
          continue;
        pairs.add(pairKey(a, b));
      }
    }
  }
  return pairs;
}

/** @param {string} text */
function rareTerms(text) {
  return [...new Set(tokenize(text).filter((term) => term.length > 4))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, 10);
}

/**
 * @param {VectorRecord[]} records
 * @param {Set<string>} candidates
 * @param {typeof DEFAULTS} options
 * @returns {SimilarityPair[]}
 */
function scorePairs(records, candidates, options) {
  /** @type {SimilarityPair[]} */
  const pairs = [];
  for (const key of candidates) {
    const parts = key.split(':').map(Number);
    const a = parts[0];
    const b = parts[1];
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }
    const left = records[a];
    const right = records[b];
    if (!left || !right) continue;
    const textScore = jaccard(tokenize(left.text), tokenize(right.text));
    if (textScore < 0.12) continue;
    const score = cosineSimilarity(left.vector, right.vector);
    /** @type {'near-duplicate' | 'related'} */
    const kind = score >= options.duplicateThreshold || textScore >= 0.82 ? 'near-duplicate' : 'related';
    if (kind === 'related' && score < options.relatedThreshold) continue;
    pairs.push({ a, b, score, textScore, kind });
  }
  return pairs.sort((a, b) => b.score - a.score).slice(0, options.maxPairs);
}

/**
 * @param {VectorRecord[]} records
 * @param {SimilarityPair[]} pairs
 * @param {Record<string, DedupResolution>} resolutions
 * @returns {DedupCluster[]}
 */
function buildClusters(records, pairs, resolutions) {
  const uf = new UnionFind(records.length);
  pairs.forEach((pair) => uf.union(pair.a, pair.b));
  /** @type {Map<number, SimilarityPair[]>} */
  const byRoot = new Map();
  pairs.forEach((pair) => {
    const root = uf.find(pair.a);
    const list = byRoot.get(root) || [];
    list.push(pair);
    byRoot.set(root, list);
  });
  return [...byRoot.entries()]
    .map(([root, clusterPairs]) => {
      const indexes = [...new Set(clusterPairs.flatMap((pair) => [pair.a, pair.b]))];
      /** @type {VectorRecord[]} */
      const clusterRecords = [];
      indexes.forEach((index) => {
        const record = records[index];
        if (record) clusterRecords.push(record);
      });
      const maxScore = Math.max(...clusterPairs.map((pair) => pair.score));
      const id = clusterId(root, clusterRecords);
      const resolution = resolutions[id] || null;
      /** @type {'open' | 'resolved' | 'ignored'} */
      const status = resolution ? (resolution.action === 'ignore' ? 'ignored' : 'resolved') : 'open';
      /** @type {'near-duplicate' | 'related'} */
      const kind = clusterPairs.some((pair) => pair.kind === 'near-duplicate') ? 'near-duplicate' : 'related';
      return {
        id,
        status,
        kind,
        score: maxScore,
        suggestedKeepSkillId: chooseKeeper(clusterRecords),
        items: clusterRecords
          .map((record) => toItem(record, maxScore))
          .sort((a, b) => b.rank.total - a.rank.total || a.skillId.localeCompare(b.skillId)),
        pairCount: clusterPairs.length,
        resolution,
      };
    })
    .filter((cluster) => cluster.items.length > 1)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * @param {VectorRecord} record
 * @param {number} score
 * @returns {DedupItem}
 */
function toItem(record, score) {
  return {
    chunkId: record.id,
    skillId: record.skillId,
    section: record.section,
    type: record.type,
    score,
    text: preview(record.text),
    rank: scoreChunk(record),
  };
}

/** @param {string} text */
function preview(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 260);
}

/** @param {string[]} a @param {string[]} b */
function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((term) => {
    if (right.has(term)) overlap += 1;
  });
  return overlap / (left.size + right.size - overlap);
}

/** @param {string} text */
function fillerDensity(text) {
  const terms = tokenize(text);
  if (!terms.length) return 0;
  return terms.filter((term) => FILLER_TERMS.has(term)).length / terms.length;
}

/** @param {number} a @param {number} b */
function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** @param {number} root @param {VectorRecord[]} records */
function clusterId(root, records) {
  const skills = [...new Set(records.map((record) => record.skillId))].sort().join('--');
  return `cluster-${root}-${skills}`.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 90);
}

/** @param {unknown} data */
function normalizeReport(data) {
  if (!data || typeof data !== 'object') return null;
  const report = /** @type {Partial<DedupReport>} */ (data);
  return {
    version: report.version || '1.0',
    generatedAt: report.generatedAt || null,
    vectorUpdatedAt: report.vectorUpdatedAt || null,
    model: report.model || null,
    thresholds: { ...DEFAULTS, ...(report.thresholds || {}) },
    stats: report.stats || {},
    clusters: Array.isArray(report.clusters) ? report.clusters : [],
    lowSpecificity: Array.isArray(report.lowSpecificity) ? report.lowSpecificity : [],
    resolutions: report.resolutions || {},
    history: Array.isArray(report.history) ? report.history : [],
  };
}

class UnionFind {
  /** @param {number} size */
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  /** @param {number} value */
  /** @param {number} value @returns {number} */
  find(value) {
    const parent = this.parent[value];
    if (parent === undefined || parent === value) return value;
    const root = this.find(parent);
    this.parent[value] = root;
    return root;
  }

  /** @param {number} a @param {number} b */
  union(a, b) {
    const left = this.find(a);
    const right = this.find(b);
    if (left !== right) this.parent[right] = left;
  }
}

module.exports = {
  DEFAULTS,
  generateDedupReport,
  loadDedupReport,
  saveDedupReport,
  resolveDedupCluster,
};
