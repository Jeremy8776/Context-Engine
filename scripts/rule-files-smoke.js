const assert = require('assert');

// The rule-files module hard-codes its RULES_DIR as path.join(__dirname, '..', '..', 'data', 'rules').
// We need to manipulate module to use a temp dir or just be tolerant of existing files.
// Strategy: first scan whatever is there, create+test+delete, and verify only our files.

const ruleFiles = require('../server/lib/rule-files');

// Record pre-existing files so we can filter them
const preExisting = new Set(ruleFiles.listRuleFiles().map((f) => f.name));

// ---- writeRuleFile ----
// GIVEN valid name and data
const rulesData = {
  coding: { hard: 'use tabs', soft: 'prefer const' },
  general: { hard: 'no secrets in code', soft: 'write tests' },
  soul: { soft: 'be concise' },
};
const writeResult = ruleFiles.writeRuleFile('__ce_test_my_rules', rulesData);
assert.strictEqual(writeResult.ok, true, 'writeRuleFile succeeds');
assert.strictEqual(writeResult.name, '__ce_test_my_rules', 'writeRuleFile returns sanitized name');

// GIVEN the file now appears in the list (filtering pre-existing)
const files = ruleFiles.listRuleFiles();
const newFiles = files.filter((f) => !preExisting.has(f.name) || f.name === '__ce_test_my_rules');
const testFile = newFiles.find((f) => f.name === '__ce_test_my_rules');
assert(testFile, 'test file appears in list');
assert(testFile.created !== null, 'file has creation timestamp');
assert.deepStrictEqual(testFile.data, rulesData, 'list includes file data');

// GIVEN a name with special characters
const sanitized = ruleFiles.writeRuleFile('  My Special Rules!!!  ', rulesData);
assert.strictEqual(sanitized.name, 'my-special-rules', 'name is sanitized (lowercase, hyphens)');
preExisting.add('my-special-rules');

// GIVEN name entirely composed of invalid characters
const invalid = ruleFiles.writeRuleFile('!!!', rulesData);
assert.strictEqual(invalid.ok, false, 'writeRuleFile rejects all-invalid name');
assert(invalid.error, 'has error message');

// GIVEN an empty/whitespace name
const emptyWrite = ruleFiles.writeRuleFile('   ', rulesData);
assert.strictEqual(emptyWrite.ok, false, 'writeRuleFile rejects empty name');

// ---- readRuleFile ----
// GIVEN an existing file
const data = ruleFiles.readRuleFile('__ce_test_my_rules');
assert.deepStrictEqual(data, rulesData, 'readRuleFile returns stored data');

// GIVEN a non-existent file
assert.strictEqual(
  ruleFiles.readRuleFile('__ce_test_no_such_file'),
  null,
  'readRuleFile returns null for missing file',
);

// ---- deleteRuleFile ----
// GIVEN deleting a non-existent file
const delMissing = ruleFiles.deleteRuleFile('__ce_test_no_such_file');
assert.strictEqual(delMissing.ok, false, 'deleteRuleFile fails for missing file');
assert.strictEqual(delMissing.error, 'Rule file not found');

// GIVEN delete with invalid name
const delInvalid = ruleFiles.deleteRuleFile('!!!');
assert.strictEqual(delInvalid.ok, false, 'deleteRuleFile rejects invalid name');

// ---- combineRuleFiles ----
// GIVEN multiple rule files
ruleFiles.writeRuleFile('__ce_test_rules_a', {
  coding: { hard: 'indent with tabs', soft: '' },
  general: { hard: '', soft: 'be helpful' },
  soul: { soft: 'friendly' },
});
ruleFiles.writeRuleFile('__ce_test_rules_b', {
  coding: { hard: '', soft: 'use typescript' },
  general: { hard: 'no console.log', soft: '' },
  soul: { soft: 'concise' },
});
const combined = ruleFiles.combineRuleFiles(['__ce_test_rules_a', '__ce_test_rules_b']);
assert.strictEqual(combined.coding.hard, 'indent with tabs', 'combine coding.hard');
assert.strictEqual(combined.coding.soft, 'use typescript', 'combine coding.soft');
assert.strictEqual(combined.general.hard, 'no console.log', 'combine general.hard');
assert.strictEqual(combined.general.soft, 'be helpful', 'combine general.soft');
assert.strictEqual(combined.soul.soft, 'friendly\nconcise', 'combine soul.soft joins');

// GIVEN a file with string-format sections (legacy)
ruleFiles.writeRuleFile('__ce_test_legacy_str', {
  coding: 'legacy coding rule',
  general: 'legacy general rule',
  soul: 'legacy soul',
});
const combinedLegacy = ruleFiles.combineRuleFiles(['__ce_test_legacy_str']);
assert.strictEqual(combinedLegacy.coding.soft, 'legacy coding rule', 'legacy string section → soft priority');
assert.strictEqual(combinedLegacy.general.soft, 'legacy general rule', 'legacy general string → soft');
assert.strictEqual(combinedLegacy.soul.soft, 'legacy soul', 'legacy soul string → soft');

// ---- Cleanup our test files only ----
const testFilesToClean = [
  '__ce_test_my_rules',
  'my-special-rules',
  '__ce_test_rules_a',
  '__ce_test_rules_b',
  '__ce_test_legacy_str',
];
for (const name of testFilesToClean) {
  ruleFiles.deleteRuleFile(name);
}

// Verify test files are gone
const afterClean = ruleFiles.listRuleFiles().filter((f) => !preExisting.has(f.name));
const afterNames = new Set(afterClean.map((f) => f.name));
for (const name of testFilesToClean) {
  assert(!afterNames.has(name), `${name} cleaned up`);
}

console.log('rule-files smoke ok');
