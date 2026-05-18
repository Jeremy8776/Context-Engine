// @ts-check

const assert = require('assert');

const { GENERIC_CONFIGS, GENERIC_FILENAMES } = require('../server/lib/compiler-generic-configs');

// ---- GENERIC_CONFIGS ----
// GIVEN configs exist for all generic tools
const configIds = Object.keys(GENERIC_CONFIGS);
assert(configIds.length >= 15, 'GENERIC_CONFIGS has entries');

// GIVEN each config has required fields
for (const [id, cfg] of Object.entries(GENERIC_CONFIGS)) {
  assert(typeof cfg === 'object' && cfg !== null, `${id}: config is non-null object`);
  assert(cfg.rules && typeof cfg.rules === 'object', `${id}: has rules config`);
  assert(typeof cfg.rules.kind === 'string', `${id}: rules.kind is string`);
  assert(
    ['flat', 'wrapped', 'wrapped-inline', 'sections', 'split-sections'].includes(cfg.rules.kind),
    `${id}: rules.kind is valid`,
  );
  assert(cfg.skills && typeof cfg.skills === 'object', `${id}: has skills config`);
  assert(typeof cfg.skills.format === 'string', `${id}: skills.format is string`);
  assert(
    ['list-bold', 'list-plain', 'h3-list', 'h2-content'].includes(cfg.skills.format),
    `${id}: skills.format is valid`,
  );
  assert(typeof cfg.skills.header === 'string', `${id}: has skills header`);
}

// ---- Specific configs have expected values ----
assert.strictEqual(GENERIC_CONFIGS.antigravity?.rules?.kind, 'sections');
assert.strictEqual(GENERIC_CONFIGS.antigravity?.skills?.format, 'h2-content');
assert(GENERIC_CONFIGS.antigravity?.memoryHeader, 'antigravity has memoryHeader');

assert.strictEqual(GENERIC_CONFIGS.kiro?.rules?.kind, 'sections');
assert.strictEqual(GENERIC_CONFIGS.kiro?.rules?.entries?.length, 3, 'kiro has 3 rule sections');

assert.strictEqual(GENERIC_CONFIGS.cline?.rules?.kind, 'sections');
assert(GENERIC_CONFIGS.cline?.preface?.includes('---'), 'cline has YAML preface');

assert.strictEqual(GENERIC_CONFIGS.aider?.rules?.kind, 'split-sections');

assert.strictEqual(GENERIC_CONFIGS.continue?.rules?.kind, 'sections');

assert.strictEqual(GENERIC_CONFIGS.zed?.rules?.kind, 'flat');
assert.strictEqual(GENERIC_CONFIGS.zed?.skills?.format, 'list-plain');

assert.strictEqual(GENERIC_CONFIGS.amp?.rules?.kind, 'wrapped');

assert.strictEqual(GENERIC_CONFIGS.devin?.rules?.kind, 'sections');

assert.strictEqual(GENERIC_CONFIGS.goose?.rules?.kind, 'flat');

assert.strictEqual(GENERIC_CONFIGS.kimi?.rules?.kind, 'wrapped-inline');

// ---- Pointer aliases ----
// void, augment, pearai are aliases
assert.strictEqual(GENERIC_CONFIGS.void, GENERIC_CONFIGS.continue, 'void → continue alias');
assert.strictEqual(GENERIC_CONFIGS.augment, GENERIC_CONFIGS.continue, 'augment → continue alias');
assert.strictEqual(GENERIC_CONFIGS.pearai, GENERIC_CONFIGS.cline, 'pearai → cline alias');

// ---- GENERIC_FILENAMES ----
const filenameIds = Object.keys(GENERIC_FILENAMES);
assert(filenameIds.length >= 15, 'GENERIC_FILENAMES has entries');

// GIVEN each filename entry is a string
for (const [id, filename] of Object.entries(GENERIC_FILENAMES)) {
  assert(typeof filename === 'string', `${id}: filename is string`);
}

// GIVEN known filenames
assert.strictEqual(GENERIC_FILENAMES.antigravity, 'GEMINI.md');
assert.strictEqual(GENERIC_FILENAMES.kiro, '.kiro/steering.md');
assert.strictEqual(GENERIC_FILENAMES.cline, '.clinerules/context-engine.md');
assert.strictEqual(GENERIC_FILENAMES.aider, 'CONVENTIONS.md');
assert.strictEqual(GENERIC_FILENAMES.continue, '.continue/rules/context-engine.md');
assert.strictEqual(GENERIC_FILENAMES.zed, '.rules');
assert.strictEqual(GENERIC_FILENAMES.junie, '.junie/guidelines.md');
assert.strictEqual(GENERIC_FILENAMES.trae, '.trae/rules/context-engine.md');
assert.strictEqual(GENERIC_FILENAMES.amp, '.ampcoderc');
assert.strictEqual(GENERIC_FILENAMES.devin, 'devin.md');
assert.strictEqual(GENERIC_FILENAMES.goose, '.goosehints');
assert.strictEqual(GENERIC_FILENAMES.void, '.void/rules.md');
assert.strictEqual(GENERIC_FILENAMES.augment, '.augment/instructions.md');
assert.strictEqual(GENERIC_FILENAMES.pearai, '.pearai/rules.md');
assert.strictEqual(GENERIC_FILENAMES.kimi, '.kimi-system-prompt.md');

console.log('compiler-generic-configs smoke ok');
