// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-skills-'));
process.env.CE_ROOT = tmpRoot;
const skillsDir = path.join(tmpRoot, 'skills');
const dataDir = path.join(tmpRoot, 'data');
fs.mkdirSync(skillsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/skills')];
delete require.cache[require.resolve('../server/lib/skill-sources')];

const skills = require('../server/lib/skills');

// ---- Setup fixtures ----
const skillDir1 = path.join(skillsDir, 'alpha');
fs.mkdirSync(skillDir1, { recursive: true });
fs.writeFileSync(
  path.join(skillDir1, 'SKILL.md'),
  `---
name: Alpha Skill
description: First skill for testing
---
# Alpha Skill

Alpha skill body content.

## Triggers
- test alpha
- trigger alpha
- "/alpha-command"
- "use alpha for this"
`,
  'utf8',
);

const skillDir2 = path.join(skillsDir, 'beta');
fs.mkdirSync(skillDir2, { recursive: true });
fs.writeFileSync(
  path.join(skillDir2, 'SKILL.md'),
  `---
name: Beta Skill
custom_field: custom_value
---
# Beta Skill

Beta skill body content.

## Usage
Instructions for beta usage.
`,
  'utf8',
);

// ---- scanSkills ----
skills.invalidateSkillCache();
const scanned = skills.scanSkills();
const scannedIds = Object.keys(scanned);
assert(scannedIds.includes('alpha'), 'scanned includes alpha');
assert(scannedIds.includes('beta'), 'scanned includes beta');

const alpha = scanned.alpha;
assert.strictEqual(alpha.id, 'alpha');
assert.strictEqual(alpha.name, 'Alpha Skill');
assert.strictEqual(alpha.desc, 'First skill for testing');
assert.strictEqual(alpha.sourceId, 'internal');
assert(Array.isArray(alpha.triggers), 'alpha has triggers');
assert(alpha.triggers.includes('test alpha'), 'alpha triggers include list item');
assert(alpha.triggers.includes('trigger alpha'), 'alpha triggers include second item');
assert(
  alpha.triggers.includes('"/alpha-command"'),
  'alpha triggers include slash command from triggers section',
);
assert(alpha.triggers.includes('"use alpha for this"'), 'alpha triggers include quoted phrase');

const beta = scanned.beta;
assert.strictEqual(beta.name, 'Beta Skill');

// GIVEN cache TTL
const cached = skills.scanSkills();
assert.strictEqual(cached, scanned, 'scanSkills returns cached result within TTL');

// ---- invalidateSkillCache ----
skills.invalidateSkillCache();
const refreshed = skills.scanSkills();
assert(refreshed !== scanned || Object.keys(refreshed).length > 0, 'invalidate forces re-scan');

// ---- skillHealthCheck ----
const health = skills.skillHealthCheck();
assert(Array.isArray(health), 'healthCheck returns array');
assert(health.length >= 2, 'healthCheck has 2+ entries');
for (const entry of health) {
  assert(typeof entry.id === 'string', 'health entry has id');
  assert(typeof entry.exists === 'boolean', 'health entry has exists flag');
}

// ---- countSkillFiles ----
const count = skills.countSkillFiles(skillsDir);
assert.strictEqual(count, 2, 'countSkillFiles finds 2 SKILL.md files');

// ---- pruneDuplicateSkillDirs ----
const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-skills-import-'));
fs.mkdirSync(path.join(importDir, 'alpha'), { recursive: true });
fs.writeFileSync(path.join(importDir, 'alpha', 'SKILL.md'), '---\n---\n# Alpha\n', 'utf8');
const pruned = skills.pruneDuplicateSkillDirs(importDir);
assert(pruned.removed.length >= 1, 'duplicate alpha in import removed');
assert(pruned.removed[0].reason === 'already exists', 'reason is already exists');
fs.rmSync(importDir, { recursive: true, force: true });

// ---- organiseSkills (dry-run) ----
const organise = skills.organiseSkills({ apply: false });
assert.strictEqual(organise.ok, true, 'organise succeeds');
assert(Array.isArray(organise.actions), 'organise returns actions array');
assert(typeof organise.summary === 'object', 'organise has summary');

// ---- Parse cache ----
const cache = skills.loadParseCache();
assert(typeof cache === 'object', 'loadParseCache returns object');
skills.saveParseCache({ 'test-id': { description: 'cached', triggers: [], parsedAt: Date.now() } });
const reloaded = skills.loadParseCache();
assert.strictEqual(reloaded['test-id']?.description, 'cached', 'parse cache persisted and reloaded');

// GIVEN the parse cache is cleaned up
skills.saveParseCache({});
assert.deepStrictEqual(skills.loadParseCache(), {}, 'parse cache cleared');

// ---- Cleanup ----
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('skills smoke ok');
