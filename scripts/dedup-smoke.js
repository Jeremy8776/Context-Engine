// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  generateDedupReport,
  loadDedupReport,
  saveDedupReport,
  resolveDedupCluster,
} = require('../server/lib/dedup');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-dedup-'));
const reportPath = path.join(tmpDir, 'dedup.json');

/** @type {import('../server/lib/vectorstore').VectorStore} */
const store = {
  version: '1.0',
  updatedAt: '2026-05-10T12:00:00.000Z',
  model: 'fixture',
  records: [
    record(
      'alpha:rules:1',
      'alpha',
      'Rules',
      'Always validate user input before writing project files.',
      [1, 0, 0],
    ),
    record(
      'beta:rules:1',
      'beta',
      'Rules',
      'Always validate user input before writing project files safely.',
      [0.98, 0.02, 0],
    ),
    record(
      'gamma:notes:1',
      'gamma',
      'Overview',
      'This tool helps the user with the task and provides information for the assistant. Use the tool when the user asks for help with information and context.',
      [0, 1, 0],
    ),
  ],
};

const report = generateDedupReport(store, { relatedThreshold: 0.8, duplicateThreshold: 0.92 });
assert(report.clusters.length >= 1, 'expected duplicate cluster');
const generatedCluster = report.clusters[0];
assert(generatedCluster, 'expected generated cluster');
assert.strictEqual(generatedCluster.kind, 'near-duplicate');
assert(report.lowSpecificity.length >= 1, 'expected low-specificity filler entry');

saveDedupReport(report, reportPath);
const reloaded = loadDedupReport(reportPath);
assert(reloaded, 'expected saved report to reload');
const firstCluster = reloaded.clusters[0];
assert(firstCluster, 'expected reloaded cluster');
const clusterId = firstCluster.id;
const resolved = resolveDedupCluster(reloaded, {
  clusterId,
  action: 'keep-skill',
  keepSkillId: firstCluster.suggestedKeepSkillId || 'alpha',
});
assert.strictEqual(resolved.clusters[0]?.status, 'resolved');
assert(resolved.history.length === 1, 'expected reversible resolution history');
const reopened = resolveDedupCluster(resolved, { clusterId, action: 'reopen' });
assert.strictEqual(reopened.clusters[0]?.status, 'open');

console.log('dedup smoke ok');

/**
 * @param {string} id
 * @param {string} skillId
 * @param {string} section
 * @param {string} text
 * @param {number[]} vector
 * @returns {import('../server/lib/vectorstore').VectorRecord}
 */
function record(id, skillId, section, text, vector) {
  return {
    id,
    skillId,
    section,
    text,
    type: 'rule',
    sourcePath: __filename,
    vector,
  };
}
