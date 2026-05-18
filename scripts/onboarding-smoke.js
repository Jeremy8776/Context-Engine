// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-onboarding-'));
process.env.CE_ROOT = tmpRoot;
const dataDir = path.join(tmpRoot, 'data');
const skillsDir = path.join(tmpRoot, 'skills');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(skillsDir, { recursive: true });

delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/backup')];
delete require.cache[require.resolve('../server/lib/skills')];
delete require.cache[require.resolve('../server/lib/skill-sources')];
delete require.cache[require.resolve('../server/lib/vectorstore')];
delete require.cache[require.resolve('../server/lib/mcp-host-config')];
delete require.cache[require.resolve('../server/lib/onboarding')];

const onboarding = require('../server/lib/onboarding');
const { writeData } = require('../server/lib/backup');

// ---- Setup minimal skills ----
const skillDir = path.join(skillsDir, 'test-skill');
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(
  path.join(skillDir, 'SKILL.md'),
  `---
name: Test Skill
---
# Test Skill
A skill for onboarding tests.
`,
  'utf8',
);

// Setup skill-states
writeData('skill-states.json', {
  states: { 'test-skill': true },
  version: '1.0',
  last_updated: new Date().toISOString(),
});
writeData('memory.json', { entries: [{ content: 'Test memory entry' }] });

// ---- getOnboardingSummary ----
// GIVEN a new root with no onboarding state
const summary = onboarding.getOnboardingSummary();
assert.strictEqual(typeof summary.shouldShow, 'boolean', 'summary has shouldShow');
assert(summary.state, 'summary has state');
assert(summary.context, 'summary has context');
assert.strictEqual(typeof summary.context.totalSkills, 'number', 'context has totalSkills');
assert.strictEqual(typeof summary.context.activeSkills, 'number', 'context has activeSkills');
assert.strictEqual(typeof summary.context.memoryEntries, 'number', 'context has memoryEntries');
assert(summary.hosts, 'summary has hosts');
assert(summary.tools, 'summary has tools');

// GIVEN no session history → should show onboarding
assert.strictEqual(summary.shouldShow, true, 'shouldShow = true with no session history');

// ---- completeOnboarding ----
// GIVEN onboarding not yet completed
const completed = onboarding.completeOnboarding();
assert.strictEqual(completed.ok, true, 'completeOnboarding succeeds');
assert(completed.state, 'completed returns state');
assert(completed.state.completedAt, 'completed has completedAt timestamp');

// WHEN checked after completion
const summary2 = onboarding.getOnboardingSummary();
assert.strictEqual(summary2.shouldShow, false, 'shouldShow = false after completion');

// ---- resetOnboarding ----
// GIVEN onboarding was completed previously
const reset = onboarding.resetOnboarding();
assert.strictEqual(reset.ok, true, 'resetOnboarding succeeds');
assert.strictEqual(reset.state.show, true, 'reset state has show = true');

const summary3 = onboarding.getOnboardingSummary();
assert.strictEqual(summary3.shouldShow, true, 'shouldShow = true after reset');

// ---- CE_NEW_USER_PROFILE env var ----
// CE_NEW_USER_PROFILE only applies when there is no existing completedAt state.
// It does NOT override completion. Verify this behavior.
delete require.cache[require.resolve('../server/lib/onboarding')];
const prevNewUser = process.env.CE_NEW_USER_PROFILE;

// GIVEN a clean root with no existing state and CE_NEW_USER_PROFILE=1
process.env.CE_NEW_USER_PROFILE = '1';
const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-onboarding-fresh-'));
process.env.CE_ROOT = freshRoot;
fs.mkdirSync(path.join(freshRoot, 'data'), { recursive: true });
fs.mkdirSync(path.join(freshRoot, 'skills'), { recursive: true });
delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/backup')];
delete require.cache[require.resolve('../server/lib/onboarding')];
const freshOnboarding = require('../server/lib/onboarding');
const freshSummary = freshOnboarding.getOnboardingSummary();
assert.strictEqual(
  freshSummary.shouldShow,
  true,
  'shouldShow = true when CE_NEW_USER_PROFILE=1 with no state',
);
fs.rmSync(freshRoot, { recursive: true, force: true });

process.env.CE_NEW_USER_PROFILE = prevNewUser;
process.env.CE_ROOT = tmpRoot;

// ---- Cleanup ----
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('onboarding smoke ok');
