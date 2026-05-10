// @ts-check

const fs = require('fs');

const GENERIC_TERMS = new Set([
  'agent',
  'assistant',
  'context',
  'data',
  'file',
  'help',
  'information',
  'input',
  'output',
  'request',
  'response',
  'task',
  'tool',
  'use',
  'user',
  'when',
]);

/**
 * @typedef {import('./vectorstore').VectorRecord} VectorRecord
 * @typedef {{ specificity: number, coverage: number, sourceWeight: number, freshness: number, total: number }} RankBreakdown
 */

/**
 * @param {VectorRecord} record
 * @returns {RankBreakdown}
 */
function scoreChunk(record) {
  const tokens = tokenize(record.text);
  const specificity = clamp(
    uniqueRatio(tokens) * 0.35 +
      preciseTermRatio(tokens) * 0.3 +
      lengthScore(tokens.length) * 0.25 +
      typeWeight(record.type) * 0.1,
  );
  const coverage = clamp(
    sectionCoverage(record.section) * 0.45 +
      typeWeight(record.type) * 0.25 +
      lengthScore(tokens.length) * 0.3,
  );
  const sourceWeight = sourceScore(record.sourcePath);
  const freshness = freshnessScore(record.sourcePath);
  const total = clamp(specificity * 0.42 + coverage * 0.26 + sourceWeight * 0.18 + freshness * 0.14);
  return { specificity, coverage, sourceWeight, freshness, total };
}

/**
 * @param {VectorRecord[]} records
 * @returns {Record<string, number>}
 */
function scoreSkills(records) {
  /** @type {Record<string, { score: number, count: number }>} */
  const bySkill = {};
  records.forEach((record) => {
    const bucket = bySkill[record.skillId] || { score: 0, count: 0 };
    bucket.score += scoreChunk(record).total;
    bucket.count += 1;
    bySkill[record.skillId] = bucket;
  });
  return Object.fromEntries(
    Object.entries(bySkill).map(([skillId, data]) => [skillId, data.count ? data.score / data.count : 0]),
  );
}

/**
 * @param {VectorRecord[]} records
 * @returns {string | null}
 */
function chooseKeeper(records) {
  const scores = scoreSkills(records);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] || null;
}

/** @param {string} text */
function tokenize(text) {
  return (
    text
      .toLowerCase()
      .replace(/`{1,3}[\s\S]*?`{1,3}/g, ' ')
      .match(/[a-z0-9][a-z0-9-]{2,}/g) || []
  );
}

/** @param {number} value */
function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

/** @param {number} count */
function lengthScore(count) {
  if (!count) return 0;
  if (count < 18) return count / 18;
  if (count > 180) return 0.75;
  return 1;
}

/** @param {string[]} tokens */
function uniqueRatio(tokens) {
  if (!tokens.length) return 0;
  return new Set(tokens).size / tokens.length;
}

/** @param {string[]} tokens */
function preciseTermRatio(tokens) {
  if (!tokens.length) return 0;
  const precise = tokens.filter((token) => token.length > 5 && !GENERIC_TERMS.has(token)).length;
  return precise / tokens.length;
}

/** @param {string} type */
function typeWeight(type) {
  if (type === 'rule') return 1;
  if (type === 'example') return 0.82;
  return 0.72;
}

/** @param {string} section */
function sectionCoverage(section) {
  if (/overview|introduction|summary/i.test(section)) return 0.45;
  if (/example|reference/i.test(section)) return 0.78;
  if (/rules|workflow|process|usage|trigger|implementation/i.test(section)) return 1;
  return 0.72;
}

/** @param {string} sourcePath */
function sourceScore(sourcePath) {
  if (/\.codex[\\/](skills|plugins)/i.test(sourcePath)) return 0.68;
  if (/node_modules|cache/i.test(sourcePath)) return 0.58;
  return 1;
}

/** @param {string} sourcePath */
function freshnessScore(sourcePath) {
  try {
    const ageDays = (Date.now() - fs.statSync(sourcePath).mtimeMs) / 86400000;
    if (ageDays <= 14) return 1;
    if (ageDays >= 365) return 0.35;
    return 1 - ((ageDays - 14) / 351) * 0.65;
  } catch {
    return 0.5;
  }
}

module.exports = { chooseKeeper, scoreChunk, scoreSkills, tokenize };
