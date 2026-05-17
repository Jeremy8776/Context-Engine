// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadVectorStore,
  saveVectorStore,
  upsertVectors,
  replaceVectors,
  searchVectors,
  cosineSimilarity,
  markIndexStale,
  clearIndexStale,
  getIndexStale,
} = require('../server/lib/vectorstore');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-vectorstore-'));
const filePath = path.join(tmpDir, 'vectors.json');

try {
  const store = upsertVectors(
    loadVectorStore(filePath),
    [
      {
        id: 'skill-a:overview:1',
        skillId: 'skill-a',
        section: 'Overview',
        text: 'Use TypeScript for safer refactors.',
        type: 'rule',
        sourcePath: 'skill-a/SKILL.md',
        vector: [1, 0, 0],
      },
      {
        id: 'skill-b:overview:1',
        skillId: 'skill-b',
        section: 'Overview',
        text: 'Design visual interface states.',
        type: 'knowledge',
        sourcePath: 'skill-b/SKILL.md',
        vector: [0, 1, 0],
      },
    ],
    'fixture-model',
  );

  saveVectorStore(store, filePath);
  const reloaded = loadVectorStore(filePath);
  const results = searchVectors(reloaded, [1, 0, 0], { limit: 1 });

  assert.strictEqual(reloaded.records.length, 2);
  assert.strictEqual(results[0]?.skillId, 'skill-a');
  assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);

  // ---- replaceVectors ----

  // GIVEN a store with existing records
  // WHEN we replace with a new set
  const replaced = replaceVectors(
    [
      {
        id: 'skill-c:overview:1',
        skillId: 'skill-c',
        section: 'Overview',
        text: 'Brand new skill.',
        type: 'knowledge',
        sourcePath: 'skill-c/SKILL.md',
        vector: [0, 0, 1],
      },
    ],
    'fixture-model',
  );
  assert.strictEqual(replaced.records.length, 1, 'replaceVectors discards previous records');
  assert.strictEqual(replaced.records[0]?.skillId, 'skill-c', 'replaceVectors keeps new records');

  // ---- upsertVectors update semantics ----

  // WHEN we upsert a record with the same ID
  const updatedStore = upsertVectors(
    store,
    [
      {
        id: 'skill-a:overview:1',
        skillId: 'skill-a',
        section: 'Overview',
        text: 'Updated text for skill-a.',
        type: 'rule',
        sourcePath: 'skill-a/SKILL.md',
        vector: [1, 0, 0],
      },
    ],
    'fixture-model',
  );
  assert.strictEqual(updatedStore.records.length, 2, 'upsert keeps same record count');
  const updatedRecord = updatedStore.records.find((r) => r.id === 'skill-a:overview:1');
  assert.strictEqual(updatedRecord?.text, 'Updated text for skill-a.', 'upsert updates existing record');

  // ---- searchVectors with skillId filter ----

  const filteredResults = searchVectors(store, [1, 0, 0], { limit: 10, skillId: 'skill-b' });
  assert.ok(
    filteredResults.every((r) => r.skillId === 'skill-b'),
    'skillId filter works',
  );

  // ---- searchVectors on empty store ----

  const emptyResults = searchVectors(loadVectorStore(path.join(tmpDir, 'nonexistent.json')), [1, 0]);
  assert.deepStrictEqual(emptyResults, [], 'search on empty store returns empty');

  // ---- cosineSimilarity edge cases ----

  assert.strictEqual(cosineSimilarity([0, 0], [1, 0]), 0, 'zero vector returns 0');
  assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0, 'orthogonal vectors return 0');
  assert.strictEqual(cosineSimilarity([], []), 0, 'empty vectors return 0');
  assert.strictEqual(cosineSimilarity([1, 0], [-1, 0]), -1, 'opposite vectors return -1');
  assert.ok(Math.abs(cosineSimilarity([1, 1], [1, 1]) - 1) < 0.001, 'parallel vectors return ~1');

  // ---- loadVectorStore with corrupt file ----

  const corruptPath = path.join(tmpDir, 'corrupt.json');
  fs.writeFileSync(corruptPath, 'NOT JSON', 'utf8');
  const corruptStore = loadVectorStore(corruptPath);
  assert.strictEqual(corruptStore.records.length, 0, 'corrupt file returns empty store');

  // ---- stale index lifecycle ----

  markIndexStale('skills changed');
  const staleState = getIndexStale();
  assert.strictEqual(staleState.stale, true, 'after markIndexStale, index is stale');
  assert.strictEqual(staleState.reason, 'skills changed', 'stale reason is preserved');

  clearIndexStale();
  const clearedState = getIndexStale();
  assert.strictEqual(clearedState.stale, false, 'after clearIndexStale, index is not stale');

  console.log('vectorstore smoke ok');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
