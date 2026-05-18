// @ts-check

// validation-smoke.js — Smoke test for request body validators

const assert = require('assert');
const { validateMemory, validateRules, validateStates } = require('../server/lib/validation');

// ---- validateMemory ----

// GIVEN valid memory data
// WHEN validated
const memOk = validateMemory({ entries: [{ content: 'User prefers dark mode' }] });
assert.strictEqual(memOk.valid, true, 'valid memory passes');
assert.strictEqual(memOk.error, null, 'valid memory has no error');

// GIVEN missing entries array
const memNoEntries = validateMemory({});
assert.strictEqual(memNoEntries.valid, false, 'missing entries fails');
assert.strictEqual(memNoEntries.error, 'Missing or invalid "entries" array');

// GIVEN entries not an array
const memBadEntries = validateMemory({ entries: 'not-array' });
assert.strictEqual(memBadEntries.valid, false, 'entries as string fails');

// GIVEN entry without content
const memNoContent = validateMemory({ entries: [{ content: '' }] });
assert.strictEqual(memNoContent.valid, false, 'empty content fails');
assert.ok(
  memNoContent.error && memNoContent.error.includes('missing "content" string'),
  'error mentions content',
);

// GIVEN entry with whitespace-only content
const memWhitespace = validateMemory({ entries: [{ content: '   ' }] });
assert.strictEqual(memWhitespace.valid, false, 'whitespace-only content fails');

// GIVEN entry that is not an object
const memBadEntry = validateMemory({ entries: ['string-entry'] });
assert.strictEqual(memBadEntry.valid, false, 'string entry fails');
assert.ok(memBadEntry.error && memBadEntry.error.includes('must be an object'), 'error mentions object');

// GIVEN null input
const memNull = validateMemory(null);
assert.strictEqual(memNull.valid, false, 'null input fails');
assert.strictEqual(memNull.error, 'Must be a JSON object');

// GIVEN parse error marker
const memParseError = validateMemory({ _parseError: true });
assert.strictEqual(memParseError.valid, false, 'parse error marker fails');

// GIVEN valid entry at index boundary
const memIdx = validateMemory({ entries: [null, { content: 'ok' }] });
assert.strictEqual(memIdx.valid, false, 'null entry at index 0 fails');
assert.ok(memIdx.error && memIdx.error.includes('Entry 0'), 'error references correct index');

// ---- validateRules ----

// GIVEN valid rules data (legacy flat-string format)
const rulesOk = validateRules({ coding: 'Use strict mode', general: 'Be helpful', soul: 'Curious' });
assert.strictEqual(rulesOk.valid, true, 'valid flat rules passes');

// GIVEN valid rules data (new priority-object format)
const rulesPriorityOk = validateRules({
  coding: { hard: 'No unused vars', soft: 'Use strict mode' },
  general: { hard: 'Be truthful', soft: 'Be helpful' },
  soul: { soft: 'Curious and direct' },
});
assert.strictEqual(rulesPriorityOk.valid, true, 'valid priority rules passes');

// GIVEN soul with invalid priority
const rulesSoulBad = validateRules({ coding: '', general: '', soul: { hard: 'not allowed' } });
assert.strictEqual(rulesSoulBad.valid, false, 'soul with hard priority fails');
assert.ok(rulesSoulBad.error && rulesSoulBad.error.includes('soul'), 'error mentions soul');

// GIVEN coding with invalid priority
const rulesCodingBad = validateRules({
  coding: { hard: 'ok', soft: 'ok', urgent: 'not allowed' },
  general: '',
  soul: '',
});
assert.strictEqual(rulesCodingBad.valid, false, 'coding with invalid priority fails');
assert.ok(rulesCodingBad.error && rulesCodingBad.error.includes('coding'), 'error mentions coding');

// GIVEN mixed flat and object
const rulesMixed = validateRules({ coding: 'text', general: { soft: 'text' }, soul: '' });
assert.strictEqual(rulesMixed.valid, true, 'mixed flat and object rules passes');

// GIVEN missing one of the required keys
const rulesMissing = validateRules({ coding: 'x', general: 'y' });
assert.strictEqual(rulesMissing.valid, false, 'missing soul key fails');
assert.ok(rulesMissing.error && rulesMissing.error.includes('soul'), 'error mentions missing key');

// GIVEN key with wrong type
const rulesWrongType = validateRules({ coding: 42, general: '', soul: '' });
assert.strictEqual(rulesWrongType.valid, false, 'numeric coding value fails');

// GIVEN array instead of object for coding
const rulesArray = validateRules({ coding: ['a', 'b'], general: '', soul: '' });
assert.strictEqual(rulesArray.valid, false, 'array coding value fails');

// GIVEN null input
assert.strictEqual(validateRules(null).valid, false, 'null rules fails');

// GIVEN parse error marker
assert.strictEqual(validateRules({ _parseError: true }).valid, false, 'parse error in rules fails');

// ---- validateStates ----

// GIVEN valid states
const statesOk = validateStates({ states: { 'skill-a': true, 'skill-b': false } });
assert.strictEqual(statesOk.valid, true, 'valid states passes');

// GIVEN states without wrapper key (should accept bare object)
const statesBare = validateStates({ 'skill-a': true });
assert.strictEqual(statesBare.valid, true, 'bare states object passes');

// GIVEN states value that is not boolean
const statesBadType = validateStates({ states: { 'skill-a': 'yes' } });
assert.strictEqual(statesBadType.valid, false, 'non-boolean state fails');
assert.ok(statesBadType.error && statesBadType.error.includes('must be boolean'), 'error mentions boolean');

// GIVEN states as array
const statesArray = validateStates({ states: ['a', 'b'] });
assert.strictEqual(statesArray.valid, false, 'array states fails');

// GIVEN null input
assert.strictEqual(validateStates(null).valid, false, 'null states fails');

// GIVEN parse error marker
assert.strictEqual(validateStates({ _parseError: true }).valid, false, 'parse error in states fails');

console.log('validation smoke ok');
