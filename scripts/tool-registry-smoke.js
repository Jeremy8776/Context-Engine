const assert = require('assert');

const { TOOL_REGISTRY } = require('../server/lib/tool-registry');

// GIVEN the registry has entries for all 22 tools
const ids = Object.keys(TOOL_REGISTRY);
assert(ids.length === 22, 'TOOL_REGISTRY has 22 entries');

// GIVEN each entry has the required shape
for (const [id, reg] of Object.entries(TOOL_REGISTRY)) {
  assert(typeof reg.label === 'string', `${id}: label is string`);
  assert(typeof reg.description === 'string', `${id}: description is string`);
  assert(Array.isArray(reg.detectPaths), `${id}: detectPaths is array`);
  assert(typeof reg.supportsGlobal === 'boolean', `${id}: supportsGlobal is boolean`);
  assert(typeof reg.supportsProject === 'boolean', `${id}: supportsProject is boolean`);
  assert(['auto', 'manual'].includes(reg.category), `${id}: category is auto or manual`);
}

// ---- Bespoke adapter tools (compiler has hard-coded functions for these) ----
const bespokeIds = ['claude', 'cursor', 'agents', 'codex', 'copilot', 'windsurf', 'ollama'];
for (const id of bespokeIds) {
  assert(TOOL_REGISTRY[id], `bespoke tool ${id} is registered`);
}

// ---- Generic config tools (use GENERIC_CONFIGS) ----
const genericIds = [
  'antigravity',
  'kiro',
  'cline',
  'aider',
  'continue',
  'zed',
  'junie',
  'trae',
  'amp',
  'devin',
  'goose',
  'void',
  'augment',
  'pearai',
  'kimi',
];
for (const id of genericIds) {
  assert(TOOL_REGISTRY[id], `generic tool ${id} is registered`);
}

// ---- Claude has expected properties ----
assert.strictEqual(TOOL_REGISTRY.claude.label, 'Claude Code');
assert.strictEqual(TOOL_REGISTRY.claude.globalPath, 'CLAUDE.md');
assert.strictEqual(TOOL_REGISTRY.claude.supportsGlobal, true);
assert.strictEqual(TOOL_REGISTRY.claude.supportsProject, true);

// ---- Cursor has expected properties ----
assert.strictEqual(TOOL_REGISTRY.cursor.label, 'Cursor');
assert.strictEqual(TOOL_REGISTRY.cursor.globalPath, null);
assert.strictEqual(TOOL_REGISTRY.cursor.supportsGlobal, false);

// ---- AGENTS.md has expected properties ----
assert.strictEqual(TOOL_REGISTRY.agents.label, 'AGENTS.md (AAIF)');
assert(TOOL_REGISTRY.agents.detectPaths.length === 0, 'agents has no detect paths (file standard)');

// ---- Kimi is manual-only ----
assert.strictEqual(TOOL_REGISTRY.kimi.category, 'manual');
assert.strictEqual(TOOL_REGISTRY.kimi.supportsGlobal, false);
assert.strictEqual(TOOL_REGISTRY.kimi.supportsProject, false);

// ---- Codex uses AGENTS.md format ----
assert.strictEqual(TOOL_REGISTRY.codex.globalPath, '.codex/instructions.md');

console.log('tool-registry smoke ok');
