const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectTools } = require('../server/lib/tool-detection');
const { ADAPTERS } = require('../server/compiler');

// GIVEN no scan/buildContext/adapters — basic detection only (path-based)
const homedir = os.homedir();
const result = detectTools(homedir, {});

// GIVEN all tools appear in the result
assert(typeof result === 'object', 'detectTools returns object');
const ids = Object.keys(result);
assert(ids.length >= 22, 'detectTools returns entries for all registered tools');

// GIVEN each tool has the expected shape
for (const [id, tool] of Object.entries(result)) {
  assert.strictEqual(tool.id, id, `${id}: id matches`);
  assert(typeof tool.label === 'string', `${id}: has label`);
  assert(typeof tool.installed === 'boolean', `${id}: has installed flag`);
  assert(Array.isArray(tool.signals), `${id}: has signals array`);
  assert(typeof tool.supportsGlobal === 'boolean', `${id}: has supportsGlobal`);
  assert(typeof tool.supportsProject === 'boolean', `${id}: has supportsProject`);
  assert(typeof tool.category === 'string', `${id}: has category`);
  assert(typeof tool.detected === 'boolean', `${id}: has detected flag`);
  assert(typeof tool.available === 'boolean', `${id}: has available flag`);
  assert(typeof tool.status === 'string', `${id}: has status`);
  assert(typeof tool.outputReady === 'boolean', `${id}: has outputReady`);
  assert(typeof tool.projectReady === 'boolean', `${id}: has projectReady`);
  assert(typeof tool.globalReady === 'boolean', `${id}: has globalReady`);
}

// GIVEN tools with no adapter are marked as missing-adapter
// (when called without adapters)
for (const tool of Object.values(result)) {
  assert.strictEqual(tool.adapterReady, false, `${tool.id}: adapterReady is false without adapters`);
  assert.strictEqual(
    tool.status,
    'missing-adapter',
    `${tool.id}: status is missing-adapter without adapters`,
  );
}

// GIVEN detection with a known path (use a tmp dir with .claude marker)
const testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-tool-detect-'));
const claudeDir = path.join(testHomeDir, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });
const result2 = detectTools(testHomeDir, {});
assert.strictEqual(result2.claude.installed, true, 'claude detected from .claude directory');
assert(result2.claude.signals.includes('.claude'), '.claude in signals');

// GIVEN detecting tools via an existing global config file
const configDir = path.join(testHomeDir, '.cursor');
fs.mkdirSync(configDir, { recursive: true });
const result3 = detectTools(testHomeDir, {});
assert.strictEqual(result3.cursor.installed, true, 'cursor detected from .cursor directory');

// GIVEN tool with globalPath that exists in the user's home
// We can't guarantee a real file exists (e.g., CLAUDE.md, .windsurfrules),
// but we verify the globalPath field is computed correctly.
const globalTools = ['windsurf', 'antigravity', 'cline', 'continue', 'codex', 'junie', 'trae', 'augment'];
for (const id of globalTools) {
  const tool = result[id];
  assert(tool.globalPath, `${id}: has globalPath`);
  assert(path.isAbsolute(tool.globalPath), `${id}: globalPath is absolute`);
}

// GIVEN tools that do NOT support global
const noGlobalTools = [
  'cursor',
  'agents',
  'copilot',
  'kiro',
  'aider',
  'zed',
  'amp',
  'devin',
  'void',
  'pearai',
  'ollama',
  'kimi',
];
for (const id of noGlobalTools) {
  assert.strictEqual(result[id].globalPath, null, `${id}: globalPath is null (no global support)`);
}

// GIVEN manual category tools are always available
assert.strictEqual(result.kimi.available, true, 'kimi is always available (manual)');

// GIVEN tools that require detection have detectionRequired set
assert.strictEqual(result.claude.detectionRequired, true, 'claude requires detection');
assert.strictEqual(result.agents.detectionRequired, false, 'agents does not require detection');

// ---- detectTools with adapters ----
// GIVEN adapters are provided
const result4 = detectTools(testHomeDir, { adapters: ADAPTERS });
for (const [id, tool] of Object.entries(result4)) {
  if (ADAPTERS[id]) {
    assert.strictEqual(tool.adapterReady, true, `${id}: adapterReady when adapter present`);
  }
}

// GIVEN detection with full context building
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-tool-detect-data-'));
const testSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-tool-detect-skills-'));

// Set up minimal fixtures
fs.writeFileSync(
  path.join(testDataDir, 'memory.json'),
  JSON.stringify({ entries: [{ content: 'test memory' }] }),
  'utf8',
);
fs.writeFileSync(
  path.join(testDataDir, 'rules.json'),
  JSON.stringify({
    coding: { hard: 'test rule', soft: '' },
    general: { hard: '', soft: '' },
    soul: { soft: '' },
  }),
  'utf8',
);
fs.writeFileSync(path.join(testDataDir, 'skill-states.json'), JSON.stringify({}), 'utf8');

// Create a minimal skill
const skillDir = path.join(testSkillsDir, 'test-skill');
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(
  path.join(skillDir, 'SKILL.md'),
  '---\nname: Test Skill\n---\n# Test Skill\nA test skill.\n',
  'utf8',
);

const { buildContext, estimateTokens } = require('../server/compiler');
const fullScan = () => {
  const { scanSkills } = require('../server/lib/skills');
  return scanSkills();
};
const result5 = detectTools(testHomeDir, {
  dataDir: testDataDir,
  skillsDir: testSkillsDir,
  scanSkills: fullScan,
  adapters: ADAPTERS,
  buildContext,
  estimateTokens,
});

// With full context, bespoke adapters should be compile-ready
for (const id of ['claude', 'cursor', 'agents', 'codex', 'copilot', 'windsurf', 'ollama']) {
  const tool = result5[id];
  assert.strictEqual(tool.compileReady, true, `${id}: compileReady with full context`);
  assert(tool.previewTokens !== null && tool.previewTokens > 0, `${id}: has previewTokens > 0`);
}

// GIVEN tools that have compileReady and supportProject are projectReady
assert.strictEqual(result5.agents.projectReady, true, 'agents: projectReady when fileStandard');

// Cleanup
fs.rmSync(testHomeDir, { recursive: true, force: true });
fs.rmSync(testDataDir, { recursive: true, force: true });
fs.rmSync(testSkillsDir, { recursive: true, force: true });

console.log('tool-detection smoke ok');
