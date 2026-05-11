// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadVectorStore,
  saveVectorStore,
  upsertVectors,
  searchVectors,
  cosineSimilarity,
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
  console.log('vectorstore smoke ok');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}