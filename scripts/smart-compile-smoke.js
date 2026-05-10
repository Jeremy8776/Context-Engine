// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rankSkillMatches, detectProjectStack } = require('../server/lib/smart-compile');
const { resolveRegisteredWorkspace } = require('../server/lib/intelligence-routes');

const ranked = rankSkillMatches([
  {
    id: 'a:1',
    skillId: 'alpha',
    section: 'Rules',
    text: 'x',
    type: 'rule',
    sourcePath: '',
    vector: [],
    score: 0.91,
  },
  {
    id: 'a:2',
    skillId: 'alpha',
    section: 'Notes',
    text: 'y',
    type: 'knowledge',
    sourcePath: '',
    vector: [],
    score: 0.62,
  },
  {
    id: 'b:1',
    skillId: 'beta',
    section: 'Rules',
    text: 'z',
    type: 'rule',
    sourcePath: '',
    vector: [],
    score: 0.78,
  },
]);
assert.strictEqual(ranked.length, 2, 'expected one entry per skill');
assert.strictEqual(ranked[0]?.skillId, 'alpha', 'highest score wins');
assert.strictEqual(ranked[0]?.hits, 2, 'alpha had two hits');
assert.deepStrictEqual(ranked[0]?.sections.sort(), ['Notes', 'Rules']);
assert.strictEqual(ranked[1]?.skillId, 'beta');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-smart-'));
fs.writeFileSync(
  path.join(tmpDir, 'package.json'),
  JSON.stringify({
    name: 'fixture',
    dependencies: { react: '*', '@anthropic-ai/sdk': '*' },
    devDependencies: { typescript: '*', eslint: '*' },
  }),
);
fs.writeFileSync(
  path.join(tmpDir, 'README.md'),
  '# Fixture\nThis project uses Electron and Python tooling for builds.',
);

const stack = detectProjectStack(tmpDir);
assert(stack.tags.includes('react'), 'detect react from package.json');
assert(stack.tags.includes('typescript'), 'detect typescript from devDependencies');
assert(stack.tags.includes('electron'), 'detect electron from README');
assert(stack.tags.includes('python'), 'detect python from README');
assert(stack.summary.startsWith('Project stack signals:'), 'summary present');

const empty = detectProjectStack('');
assert.strictEqual(empty.tags.length, 0, 'no path → no tags');
assert.strictEqual(empty.summary, '', 'no summary when empty');

// Workspace gate: /api/compile/smart must reject any projectPath that isn't a
// registered workspace, so smart compile cannot become an arbitrary file-read
// primitive on the loopback API.
const wsFile = path.join(tmpDir, 'workspaces.json');
fs.writeFileSync(wsFile, JSON.stringify({ workspaces: [{ path: tmpDir, label: 'fixture' }] }));

assert.strictEqual(
  resolveRegisteredWorkspace('', wsFile),
  null,
  'empty projectPath should pass through as null',
);
assert.strictEqual(
  resolveRegisteredWorkspace(undefined, wsFile),
  null,
  'undefined projectPath should pass through as null',
);
assert.strictEqual(
  resolveRegisteredWorkspace(tmpDir, wsFile),
  tmpDir,
  'registered path should resolve to canonical workspace',
);

/** @type {Error | null} */
let threw = null;
try {
  resolveRegisteredWorkspace(os.homedir(), wsFile);
} catch (e) {
  threw = e instanceof Error ? e : new Error(String(e));
}
assert.ok(threw, 'unregistered projectPath must throw');
assert.match(String(threw?.message || ''), /registered workspace/i);

// Missing workspaces.json should still reject (treats list as empty).
threw = null;
try {
  resolveRegisteredWorkspace(tmpDir, path.join(tmpDir, 'does-not-exist.json'));
} catch (e) {
  threw = e instanceof Error ? e : new Error(String(e));
}
assert.ok(threw, 'missing workspaces file → reject any non-empty path');

console.log('smart-compile smoke ok');
