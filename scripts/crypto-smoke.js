// @ts-check

// crypto-smoke.js — Smoke test for API key encryption/decryption

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-crypto-'));
process.env.CE_ROOT = testRoot;
fs.mkdirSync(path.join(testRoot, 'data'), { recursive: true });

delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/crypto')];

const { KEYS_FILE } = require('../server/lib/config');
const { getApiKey, setApiKey, removeApiKey } = require('../server/lib/crypto');

// GIVEN no keys file exists
// WHEN we retrieve a key
const missing = getApiKey('CE_TEST_KEY');
assert.strictEqual(missing, null, 'getApiKey returns null when no keys file exists');

// WHEN we store a key
setApiKey('CE_TEST_KEY', 'sk-secret-123');
// THEN the key file exists
assert(fs.existsSync(KEYS_FILE), 'key file is created after setApiKey');
// AND we can retrieve it
const retrieved = getApiKey('CE_TEST_KEY');
assert.strictEqual(retrieved, 'sk-secret-123', 'getApiKey returns the stored value');

// GIVEN an environment variable with the same name
process.env.CE_TEST_KEY = 'env-override';
// WHEN we retrieve the key
const envResult = getApiKey('CE_TEST_KEY');
// THEN the env var takes precedence
assert.strictEqual(envResult, 'env-override', 'env var overrides stored key');
delete process.env.CE_TEST_KEY;

// WHEN we retrieve after env var is removed
const afterEnv = getApiKey('CE_TEST_KEY');
assert.strictEqual(afterEnv, 'sk-secret-123', 'stored key used when env var is gone');

// WHEN we overwrite a key
setApiKey('CE_TEST_KEY', 'sk-new-value');
const overwritten = getApiKey('CE_TEST_KEY');
assert.strictEqual(overwritten, 'sk-new-value', 'setApiKey overwrites existing key');

// GIVEN multiple keys
setApiKey('CE_KEY_A', 'value-a');
setApiKey('CE_KEY_B', 'value-b');
// THEN both are retrievable
assert.strictEqual(getApiKey('CE_KEY_A'), 'value-a', 'first key preserved after second set');
assert.strictEqual(getApiKey('CE_KEY_B'), 'value-b', 'second key stored correctly');

// WHEN we remove a key
removeApiKey('CE_KEY_A');
// THEN it is gone
assert.strictEqual(getApiKey('CE_KEY_A'), null, 'removed key returns null');
// AND the other key is unaffected
assert.strictEqual(getApiKey('CE_KEY_B'), 'value-b', 'other key unaffected by removal');

// WHEN we remove a key that does not exist
removeApiKey('CE_NONEXISTENT');
// THEN no error is thrown and the file remains valid
assert.strictEqual(getApiKey('CE_KEY_B'), 'value-b', 'file still valid after removing nonexistent key');

// GIVEN a keys file with a corrupted entry (bad ciphertext)
const corruptKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
corruptKeys['CE_CORRUPT'] = { iv: '00', tag: '00', data: 'not-real-hex!' };
fs.writeFileSync(KEYS_FILE, JSON.stringify(corruptKeys, null, 2), 'utf8');
// WHEN we retrieve the corrupted key
const corruptResult = getApiKey('CE_CORRUPT');
// THEN it returns null (graceful failure)
assert.strictEqual(corruptResult, null, 'getApiKey returns null for corrupted ciphertext');

// WHEN we retrieve a key that never existed
assert.strictEqual(getApiKey('CE_NEVER_SET'), null, 'getApiKey returns null for never-set key');

// GIVEN a key with special characters
const specialValue = 'key-with-quotes-"and-escapes\n\t\\';
setApiKey('CE_SPECIAL', specialValue);
// WHEN retrieved
const specialResult = getApiKey('CE_SPECIAL');
assert.strictEqual(specialResult, specialValue, 'special characters survive round-trip');

// GIVEN a key with unicode
const unicodeValue = 'k\u00e9y-\u00e9\u00e0\u00fc\u00f1';
setApiKey('CE_UNICODE', unicodeValue);
const unicodeResult = getApiKey('CE_UNICODE');
assert.strictEqual(unicodeResult, unicodeValue, 'unicode survives round-trip');

// GIVEN a keys file that is not valid JSON
fs.writeFileSync(KEYS_FILE, 'NOT JSON', 'utf8');
// WHEN we try to set a new key (should overwrite)
setApiKey('CE_AFTER_CORRUPT', 'survives');
const afterCorrupt = getApiKey('CE_AFTER_CORRUPT');
assert.strictEqual(afterCorrupt, 'survives', 'setApiKey recovers from corrupt keys file');

// cleanup
fs.rmSync(testRoot, { recursive: true, force: true });
console.log('crypto smoke ok');
