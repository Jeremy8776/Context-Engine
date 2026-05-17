// @ts-check

// ranking-smoke.js — Smoke test for dedup ranking/scoring

const assert = require('assert');
const { chooseKeeper, scoreChunk, scoreSkills, tokenize } = require('../server/lib/ranking');

// ---- tokenize ----

// GIVEN a simple sentence
// WHEN tokenized
const tokens = tokenize('Use TypeScript for safer refactors');
assert.ok(
  tokens.some((t) => t === 'typescript'),
  'lowercases tokens',
);
assert.ok(
  tokens.some((t) => t === 'refactors'),
  'extracts individual words',
);

// GIVEN text with backtick code blocks
const codeTokens = tokenize('Set `foo.bar = 1` in the config');
assert.ok(!codeTokens.some((t) => t === 'foo.bar'), 'code inside backticks is removed');
assert.ok(
  codeTokens.some((t) => t === 'config'),
  'non-code text is preserved',
);

// GIVEN empty text
const emptyTokens = tokenize('');
assert.deepStrictEqual(emptyTokens, [], 'empty text produces empty tokens');

// GIVEN text with only short words
const shortTokens = tokenize('a b c d');
assert.deepStrictEqual(shortTokens, [], 'words under 3 chars are filtered');

// ---- scoreChunk ----

/** @type {import('../server/lib/vectorstore').VectorRecord} */
const ruleChunk = {
  id: 'test:1',
  skillId: 'test-skill',
  section: 'Rules',
  text: 'Always use TypeScript strict mode for safer refactoring workflows',
  type: 'rule',
  sourcePath: 'test-skill/SKILL.md',
  vector: [0.1],
};
const ruleScore = scoreChunk(ruleChunk);
assert.strictEqual(typeof ruleScore.total, 'number', 'scoreChunk returns total');
assert.ok(ruleScore.total >= 0 && ruleScore.total <= 1, 'total is between 0 and 1');
assert.strictEqual(typeof ruleScore.specificity, 'number', 'scoreChunk returns specificity');
assert.strictEqual(typeof ruleScore.coverage, 'number', 'scoreChunk returns coverage');
assert.strictEqual(typeof ruleScore.sourceWeight, 'number', 'scoreChunk returns sourceWeight');
assert.strictEqual(typeof ruleScore.freshness, 'number', 'scoreChunk returns freshness');

/** @type {import('../server/lib/vectorstore').VectorRecord} */
const exampleChunk = { ...ruleChunk, id: 'test:2', type: 'example', section: 'Example', vector: [0.1] };
const exampleScore = scoreChunk(exampleChunk);
assert.ok(exampleScore.total < ruleScore.total, 'example score is lower than rule score');

/** @type {import('../server/lib/vectorstore').VectorRecord} */
const knowledgeChunk = { ...ruleChunk, id: 'test:3', type: 'knowledge', section: 'Overview', vector: [0.1] };
const knowledgeScore = scoreChunk(knowledgeChunk);
assert.ok(knowledgeScore.total < ruleScore.total, 'knowledge score is lower than rule score');

// ---- scoreSkills ----

/** @type {import('../server/lib/vectorstore').VectorRecord[]} */
const records = [
  { ...ruleChunk, id: 'a:1', skillId: 'skill-a', vector: [0.1] },
  {
    ...ruleChunk,
    id: 'a:2',
    skillId: 'skill-a',
    text: 'Different workflow implementation process',
    vector: [0.1],
  },
  { ...ruleChunk, id: 'b:1', skillId: 'skill-b', type: 'knowledge', vector: [0.1] },
];
const skillScores = scoreSkills(records);
assert.strictEqual(typeof skillScores['skill-a'], 'number', 'skill-a has a score');
assert.strictEqual(typeof skillScores['skill-b'], 'number', 'skill-b has a score');
const aScore = /** @type {number} */ (skillScores['skill-a']);
const bScore = /** @type {number} */ (skillScores['skill-b']);
assert.ok(aScore > bScore, 'skill with rule records scores higher');

// GIVEN empty records
const emptyScores = scoreSkills(/** @type {import('../server/lib/vectorstore').VectorRecord[]} */ ([]));
assert.deepStrictEqual(emptyScores, {}, 'empty records produce empty scores');

// ---- chooseKeeper ----

const keeper = chooseKeeper(records);
assert.strictEqual(keeper, 'skill-a', 'chooseKeeper picks highest-scoring skill');

// GIVEN empty records
assert.strictEqual(
  chooseKeeper(/** @type {import('../server/lib/vectorstore').VectorRecord[]} */ ([])),
  null,
  'chooseKeeper returns null for empty records',
);

console.log('ranking smoke ok');
