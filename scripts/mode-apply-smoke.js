// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// GIVEN: a CE_ROOT with two skills and default mode data
const testRoot = path.join(os.tmpdir(), 'ce-mode-test-' + Date.now());
const dataDir = path.join(testRoot, 'data');
const skillsDir = path.join(testRoot, 'skills');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(skillsDir, 'skill-a'), { recursive: true });
fs.mkdirSync(path.join(skillsDir, 'skill-b'), { recursive: true });
fs.writeFileSync(
  path.join(skillsDir, 'skill-a', 'SKILL.md'),
  '---\nname: skill-a\ndescription: Skill A\n---\n# A',
);
fs.writeFileSync(
  path.join(skillsDir, 'skill-b', 'SKILL.md'),
  '---\nname: skill-b\ndescription: Skill B\n---\n# B',
);
fs.writeFileSync(path.join(dataDir, 'rules.json'), JSON.stringify({ coding: '', general: '', soul: '' }));

// Override CE_ROOT before requiring modules
process.env.CE_ROOT = testRoot;

// Clear require cache so config picks up new CE_ROOT
delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/modes')];
delete require.cache[require.resolve('../server/lib/skills')];
delete require.cache[require.resolve('../server/lib/backup')];

const { applyMode, DEFAULT_MODES } = require('../server/lib/modes');
const { scanSkills, invalidateSkillCache } = require('../server/lib/skills');
const { writeData } = require('../server/lib/backup');

invalidateSkillCache();
scanSkills(true);

// WHEN: a mode with an empty skills list is applied
const result = applyMode('coding');

// THEN: no skills should be disabled
assert(result, 'applyMode should return a result');
const states = /** @type {Record<string, boolean>} */ (result.states || result);
console.log('States after coding mode:', JSON.stringify(states));

assert(states['skill-a'] !== false, 'skill-a should NOT be disabled by a mode with an empty skill list');
assert(states['skill-b'] !== false, 'skill-b should NOT be disabled by a mode with an empty skill list');

// WHEN: the "all" mode is applied
invalidateSkillCache();
const allResult = applyMode('all');
assert(allResult, 'all mode should return a result');
const allStates = /** @type {Record<string, boolean>} */ (allResult.states || allResult);
console.log('States after all mode:', JSON.stringify(allStates));

// THEN: all skills should be active
assert(allStates['skill-a'] === true, 'skill-a should be active in all mode');
assert(allStates['skill-b'] === true, 'skill-b should be active in all mode');

// WHEN: a mode that lists only skill-a is created and applied
const modesFile = path.join(dataDir, 'modes.json');
const modesData = { modes: [...DEFAULT_MODES.modes] };
/** @type {Array<{id: string, label: string, icon: string, desc: string, skills: string[]}>} */
const modesArr = modesData.modes;
modesArr.push({
  id: 'only-a',
  label: 'Only A',
  icon: 'bolt',
  desc: 'Only skill A',
  skills: ['skill-a'],
});
fs.writeFileSync(modesFile, JSON.stringify(modesData), 'utf8');

invalidateSkillCache();
const onlyAResult = applyMode('only-a');
assert(onlyAResult, 'only-a mode should return a result');
const onlyAStates = /** @type {Record<string, boolean>} */ (onlyAResult.states || onlyAResult);
console.log('States after only-a mode:', JSON.stringify(onlyAStates));

// THEN: skill-a should be active, skill-b should keep its previous state (not be force-disabled)
assert(onlyAStates['skill-a'] === true, 'skill-a should be active in only-a mode');
// skill-b was true from the "all" mode apply above — it should remain true
assert(
  onlyAStates['skill-b'] !== false,
  'skill-b should NOT be force-disabled by a mode that only lists skill-a',
);

// GIVEN: fresh skills with an explicitly disabled skill
invalidateSkillCache();
const explicitResult = applyMode('all');
assert(explicitResult, 'explicit all mode should return a result');
const explicitStates = /** @type {Record<string, boolean>} */ (explicitResult.states || explicitResult);
// Manually disable skill-b to simulate a user toggle
explicitStates['skill-b'] = false;
writeData('skill-states.json', {
  version: '1.0',
  last_updated: new Date().toISOString().split('T')[0],
  states: explicitStates,
});

// WHEN: the only-a mode is applied to a state where skill-b was off
invalidateSkillCache();
const afterToggleResult = applyMode('only-a');
assert(afterToggleResult, 'after-toggle only-a mode should return a result');
const afterToggleStates = /** @type {Record<string, boolean>} */ (
  afterToggleResult.states || afterToggleResult
);
console.log('States after only-a with skill-b previously off:', JSON.stringify(afterToggleStates));

// THEN: skill-a should be active, skill-b should stay off (its last explicit state)
assert(afterToggleStates['skill-a'] === true, 'skill-a should be active');
assert(afterToggleStates['skill-b'] === false, 'skill-b should keep its explicitly-set-off state');

// Cleanup
fs.rmSync(testRoot, { recursive: true, force: true });

console.log('mode-apply smoke ok');
