const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-compiler-'));
const dataDir = path.join(tmpRoot, 'data');
const skillsDir = path.join(tmpRoot, 'skills');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(skillsDir, { recursive: true });

const {
  compile,
  buildContext,
  estimateTokens,
  getAvailableTargets,
  compileToGlobal,
  ADAPTERS,
} = require('../server/compiler');

// ---- Setup fixtures ----
const skillDir1 = path.join(skillsDir, 'test-skill-a');
fs.mkdirSync(skillDir1, { recursive: true });
fs.writeFileSync(
  path.join(skillDir1, 'SKILL.md'),
  `---
name: Test Skill A
description: A test skill for compiling
---
# Test Skill A

This skill does testing things.

## Triggers
- run tests
- smoke test
`,
  'utf8',
);

const skillDir2 = path.join(skillsDir, 'test-skill-b');
fs.mkdirSync(skillDir2, { recursive: true });
fs.writeFileSync(
  path.join(skillDir2, 'SKILL.md'),
  '---\n' +
    'name: Test Skill B\n' +
    '---\n' +
    '# Test Skill B\n' +
    '\n' +
    'This skill helps with things.\n' +
    '\n' +
    '## Usage\n' +
    '- deploy command\n',
  'utf8',
);

const memoryData = {
  version: '1.0',
  entries: [
    { content: 'User prefers tabs over spaces.', timestamp: Date.now() },
    { content: 'Project uses TypeScript strict mode.', timestamp: Date.now() },
  ],
};

const rulesData = {
  coding: { hard: 'Always use strict TypeScript.', soft: 'Prefer functional patterns.' },
  general: { hard: 'Never commit secrets.', soft: 'Keep functions under 50 lines.' },
  soul: { soft: 'Be concise and direct.' },
};

const fullSkillsDir = skillsDir;

fs.writeFileSync(path.join(dataDir, 'memory.json'), JSON.stringify(memoryData), 'utf8');
fs.writeFileSync(path.join(dataDir, 'rules.json'), JSON.stringify(rulesData), 'utf8');
fs.writeFileSync(
  path.join(dataDir, 'skill-states.json'),
  JSON.stringify({ 'test-skill-a': true, 'test-skill-b': true }),
  'utf8',
);

/** @returns {Record<string, any>} */
function scanSkills() {
  const result = {};
  const walk = (currentDir) => {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;
      const skillFile = path.join(fullPath, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const fm = {};
        if (fmMatch) {
          for (const line of fmMatch[1].replace(/\r\n/g, '\n').split('\n')) {
            const m = line.match(/^(\w[\w_-]*):\s*(.+)/);
            if (m) fm[m[1]] = m[2].trim();
          }
        }
        result[item] = {
          id: item,
          bareId: item,
          name: fm.name || item,
          cat: 'Uncategorized',
          type: 'custom',
          path: skillFile,
          desc: fm.description || 'No description',
          triggers: [],
          needsParse: false,
          sourceId: 'internal',
          sourceLabel: 'Internal',
        };
      } else {
        walk(fullPath);
      }
    }
  };
  walk(fullSkillsDir);
  return result;
}

// ---- estimateTokens ----
// GIVEN empty text
assert.strictEqual(estimateTokens(''), 0, 'empty text → 0 tokens');
assert.strictEqual(estimateTokens(null), 0, 'null text → 0 tokens');

// GIVEN short text
const tokens = estimateTokens('Hello world this is a test sentence.');
assert(typeof tokens === 'number', 'estimateTokens returns number');
assert(tokens > 0, 'estimateTokens is positive for text');

// GIVEN longer text with code blocks
const textWithCode = [
  'Here is some documentation.',
  '',
  '```js',
  'const x = 1;',
  'const y = 2;',
  'console.log(x + y);',
  '```',
  '',
  'More prose here.',
].join('\n');
const codeTokens = estimateTokens(textWithCode);
assert(codeTokens > tokens, 'code blocks add to token count');

// ---- buildContext ----
// GIVEN data files and skill directories
const ctx = buildContext({ dataDir, skillsDir: fullSkillsDir, scanSkills });

assert(ctx.memory !== null, 'ctx has memory');
assert(Array.isArray(ctx.memory.entries), 'memory.entries is array');
assert.strictEqual(ctx.memory.entries.length, 2, '2 memory entries');

assert(ctx.rules !== null, 'ctx has rules');
assert.strictEqual(ctx.rules.coding.hard, 'Always use strict TypeScript.');
assert.strictEqual(ctx.rules.general.hard, 'Never commit secrets.');
assert.strictEqual(ctx.rules.soul.soft, 'Be concise and direct.');

assert(Array.isArray(ctx.activeSkills), 'ctx has activeSkills array');
assert.strictEqual(ctx.activeSkills.length, 2, '2 active skills');
assert.strictEqual(ctx.totalSkills, 2, 'totalSkills matches');

// GIVEN selectedSkillIds filter
const filteredCtx = buildContext({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  selectedSkillIds: ['test-skill-a'],
});
assert.strictEqual(filteredCtx.activeSkills.length, 1, 'filtered to 1 skill');
assert.strictEqual(filteredCtx.activeSkills[0].id, 'test-skill-a');

// GIVEN rulesOverride
const overrideCtx = buildContext({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  rulesOverride: {
    coding: { hard: 'OVERRIDE', soft: '' },
    general: { hard: '', soft: '' },
    soul: { soft: '' },
  },
});
assert.strictEqual(overrideCtx.rules.coding.hard, 'OVERRIDE', 'rulesOverride takes effect');

// GIVEN legacy flat-string rules
const flatRules = { coding: 'flat coding', general: 'flat general', soul: 'flat soul' };
const flatCtx = buildContext({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  rulesOverride: flatRules,
});
assert.strictEqual(flatCtx.rules.coding.soft, 'flat coding', 'legacy string → soft priority');
assert.strictEqual(flatCtx.rules.coding.hard, '', 'legacy string → hard is empty');

// GIVEN sessionStart in rules
const sessionRules = {
  coding: { hard: '', soft: '' },
  general: { hard: '', soft: '' },
  soul: { soft: '' },
  sessionStart: 'Continue from the last checkpoint.',
};
const sessionCtx = buildContext({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  rulesOverride: sessionRules,
});
assert.strictEqual(sessionCtx.sessionStart, 'Continue from the last checkpoint.');

// ---- getAvailableTargets ----
const targets = getAvailableTargets();
assert(Array.isArray(targets), 'getAvailableTargets returns array');
assert(targets.length >= 22, 'at least 22 targets');
for (const t of targets) {
  assert(typeof t.id === 'string', `target ${t.id} has id`);
  assert(typeof t.filename === 'string', `target ${t.id} has filename`);
}

// ---- ADAPTERS registry ----
const adapterIds = Object.keys(ADAPTERS);
assert(adapterIds.length >= 22, 'ADAPTERS has all entries');

// ---- compile: bespoke adapters ----
// GIVEN compile for Claude
const claudeResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['claude'] });
assert.strictEqual(claudeResult.errors.length, 0, 'claude: no errors');
assert(claudeResult.results.claude, 'claude: has result');
assert(typeof claudeResult.results.claude.content === 'string', 'claude: content is string');
assert(claudeResult.results.claude.content.includes('# System Context'), 'claude: has System Context');
assert(claudeResult.results.claude.content.includes('Uncategorized'), 'claude: includes skill category');
assert(claudeResult.results.claude.tokens > 0, 'claude: has token count');
assert.strictEqual(claudeResult.results.claude.filename, 'CLAUDE.md', 'claude: filename');

// GIVEN compile for Cursor
const cursorResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['cursor'] });
assert.strictEqual(cursorResult.errors.length, 0, 'cursor: no errors');
assert(cursorResult.results.cursor, 'cursor: has result');
assert(cursorResult.results.cursor.content.includes('# Rules'), 'cursor: has Rules section');
assert(cursorResult.results.cursor.filename, '.cursorrules', 'cursor: filename');

// GIVEN compile for AGENTS.md
const agentsResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['agents'] });
assert.strictEqual(agentsResult.errors.length, 0, 'agents: no errors');
assert(agentsResult.results.agents.content.includes('---'), 'agents: has YAML frontmatter');
assert(agentsResult.results.agents.content.includes('# Agent Instructions'), 'agents: has AAIF header');
assert.strictEqual(agentsResult.results.agents.filename, 'AGENTS.md', 'agents: filename');

// GIVEN compile for Copilot
const copilotResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['copilot'] });
assert.strictEqual(copilotResult.errors.length, 0, 'copilot: no errors');
assert.strictEqual(
  copilotResult.results.copilot.filename,
  '.github/copilot-instructions.md',
  'copilot: filename',
);

// GIVEN compile for Windsurf
const windsurfResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['windsurf'] });
assert.strictEqual(windsurfResult.errors.length, 0, 'windsurf: no errors');
assert.strictEqual(windsurfResult.results.windsurf.filename, '.windsurfrules', 'windsurf: filename');

// GIVEN compile for Ollama
const ollamaResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['ollama'] });
assert.strictEqual(ollamaResult.errors.length, 0, 'ollama: no errors');
assert(ollamaResult.results.ollama.content.includes('# Modelfile'), 'ollama: has Modelfile header');
assert(ollamaResult.results.ollama.content.includes('SYSTEM """'), 'ollama: has SYSTEM block');
assert.strictEqual(ollamaResult.results.ollama.filename, 'Modelfile.context', 'ollama: filename');

// ---- compile: generic adapters ----
const genericTargets = [
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
  'kimi',
];
for (const target of genericTargets) {
  const result = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills, targets: [target] });
  assert.strictEqual(result.errors.length, 0, `${target}: no compile errors`);
  assert(result.results[target], `${target}: has result`);
  assert(typeof result.results[target].content === 'string', `${target}: content is string`);
  assert(result.results[target].content.length > 10, `${target}: content is non-trivial`);
  assert(result.results[target].tokens > 0, `${target}: has token count`);
}

// ---- compile: all targets at once ----
const allResult = compile({ dataDir, skillsDir: fullSkillsDir, scanSkills });
assert.strictEqual(allResult.errors.length, 0, 'all targets: no errors');
assert.strictEqual(
  Object.keys(allResult.results).length,
  adapterIds.length,
  'all targets: all results present',
);

// ---- compile: unknown target ----
const unknownResult = compile({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  targets: ['nonexistent-tool'],
});
assert(unknownResult.errors.length > 0, 'unknown target produces error');
assert(unknownResult.errors[0].includes('nonexistent-tool'), 'error mentions unknown target');

// ---- compile: output to disk ----
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-compiler-output-'));
const diskResult = compile({
  dataDir,
  skillsDir: fullSkillsDir,
  scanSkills,
  targets: ['claude', 'agents'],
  outputDir,
});
assert.strictEqual(diskResult.errors.length, 0, 'compile to disk: no errors');
assert(fs.existsSync(path.join(outputDir, 'CLAUDE.md')), 'CLAUDE.md written to disk');
assert(fs.existsSync(path.join(outputDir, 'AGENTS.md')), 'AGENTS.md written to disk');
fs.rmSync(outputDir, { recursive: true, force: true });

// ---- compile: sessionStart in context ----
const sessionRules2 = { ...rulesData, sessionStart: '## Resuming work\nCheck HANDOFF.md for state.' };
const sessionTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-compiler-session-'));
const sessionDataDir = path.join(sessionTmpRoot, 'data');
const sessionSkillsDir = path.join(sessionTmpRoot, 'skills');
fs.mkdirSync(sessionDataDir, { recursive: true });
fs.mkdirSync(sessionSkillsDir, { recursive: true });
fs.writeFileSync(path.join(sessionDataDir, 'memory.json'), JSON.stringify(memoryData), 'utf8');
fs.writeFileSync(path.join(sessionDataDir, 'rules.json'), JSON.stringify(sessionRules2), 'utf8');
fs.writeFileSync(path.join(sessionDataDir, 'skill-states.json'), JSON.stringify({}), 'utf8');

const sessionCtx2 = buildContext({
  dataDir: sessionDataDir,
  skillsDir: sessionSkillsDir,
  scanSkills: () => ({}),
});
assert.strictEqual(
  sessionCtx2.sessionStart,
  '## Resuming work\nCheck HANDOFF.md for state.',
  'sessionStart in context',
);

const sessionResult = compile({
  dataDir: sessionDataDir,
  skillsDir: sessionSkillsDir,
  scanSkills: () => ({}),
  targets: ['claude'],
});
assert(
  sessionResult.results.claude.content.includes('## Resuming work'),
  'claude: includes session start block',
);

fs.rmSync(sessionTmpRoot, { recursive: true, force: true });

// ---- compileToGlobal (uses a temp homedir) ----
// Only test tools that support global install (have globalPath in TOOL_REGISTRY)
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-compile-global-'));
const globalResult = compileToGlobal(
  {
    dataDir,
    skillsDir: fullSkillsDir,
    scanSkills,
    targets: ['claude', 'windsurf'],
  },
  fakeHome,
);
assert.strictEqual(globalResult.ok, true, 'compileToGlobal succeeds');
assert(globalResult.installed.claude, 'claude installed globally');
assert(globalResult.installed.windsurf, 'windsurf installed globally');
assert(fs.existsSync(path.join(fakeHome, 'CLAUDE.md')), 'CLAUDE.md at fake home');
assert(fs.existsSync(path.join(fakeHome, '.windsurfrules')), '.windsurfrules at fake home');
fs.rmSync(fakeHome, { recursive: true, force: true });

// ---- compileToGlobal: unknown target ----
const globalBad = compileToGlobal(
  { dataDir, skillsDir: fullSkillsDir, scanSkills, targets: ['nonexistent'] },
  fakeHome,
);
assert(globalBad.errors.length > 0, 'compileToGlobal reports error for unknown target');

// ---- compile: context summary ----
assert.strictEqual(allResult.context.activeSkills, 2, 'context summarizes active skills');
assert.strictEqual(allResult.context.totalSkills, 2, 'context summarizes total skills');

// ---- Cleanup ----
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('compiler smoke ok');
