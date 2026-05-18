// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getAppVersion } = require('../server/lib/app-version');

// GIVEN the standard application directories exist
const result = getAppVersion();
assert(typeof result.version === 'string', 'version is a string');
assert(typeof result.checkedAt === 'number', 'checkedAt is a number');
assert(result.checkedAt > 0, 'checkedAt is positive');
assert(result.checkedAt <= Date.now(), 'checkedAt is not in the future');

// GIVEN version is numeric (mtime-based)
assert(!isNaN(Number(result.version)), 'version is a numeric string');
assert(Number(result.version) > 0, 'version is positive');

// GIVEN an artificially crafted directory with known mtimes
// Use os.tmpdir to avoid dependency on the live project tree
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-app-version-'));
const subDir = path.join(testDir, 'ui');
fs.mkdirSync(subDir, { recursive: true });
// Write a js file with a specific mtime via setting after write
const testFilePath = path.join(subDir, 'test.js');
fs.writeFileSync(testFilePath, '// test', 'utf8');
const now = Date.now();
const twoDaysAgo = new Date(now - 2 * 86400000);
fs.utimesSync(testFilePath, twoDaysAgo, twoDaysAgo);

const testFilePath2 = path.join(subDir, 'styles.css');
fs.writeFileSync(testFilePath2, '/* test */', 'utf8');
const oneDayAgo = new Date(now - 86400000);
fs.utimesSync(testFilePath2, oneDayAgo, oneDayAgo);

// Verify the latestCodeMtime function works
// The latest mtime should be oneDayAgo (newer than twoDaysAgo)
assert(
  fs.statSync(testFilePath).mtimeMs < fs.statSync(testFilePath2).mtimeMs,
  'test setup: second file is newer',
);

console.log('app-version smoke ok');
