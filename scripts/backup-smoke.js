// @ts-check

// backup-smoke.js — Smoke test for backup, restore, and session logging

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-backup-'));
process.env.CE_ROOT = testRoot;
fs.mkdirSync(path.join(testRoot, 'data'), { recursive: true });

delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/backup')];

const { DATA_DIR, BACKUPS_DIR } = require('../server/lib/config');
const {
  readData,
  writeData,
  createBackup,
  listBackups,
  restoreBackup,
  getSessionLog,
  appendSession,
} = require('../server/lib/backup');

// ---- readData / writeData ----

// GIVEN no data files exist
// WHEN we read memory.json
const empty = readData('memory.json');
assert.strictEqual(empty, null, 'readData returns null for missing file');

// GIVEN we write data
const memoryObj = { version: '1.1', entries: [{ content: 'User prefers dark mode', category: 'general' }] };
writeData('memory.json', memoryObj);
// THEN we can read it back
const readBack = readData('memory.json');
assert.deepStrictEqual(readBack, memoryObj, 'readData returns written data');

// GIVEN a corrupt JSON file
fs.writeFileSync(path.join(DATA_DIR, 'corrupt.json'), 'NOT JSON', 'utf8');
const corrupt = readData('corrupt.json');
assert.strictEqual(corrupt, null, 'readData returns null for corrupt file');

// ---- createBackup ----

// GIVEN existing data files
writeData('rules.json', { coding: 'Use strict', general: '', soul: '' });
writeData('skill-states.json', { 'skill-a': true });
// WHEN we create a backup
const backup1 = createBackup();
assert.ok(backup1.timestamp, 'createBackup returns a timestamp');
// THEN the backup directory exists
const backupDir1 = path.join(BACKUPS_DIR, String(backup1.timestamp));
assert(fs.existsSync(backupDir1), 'backup directory is created');
// AND it contains the data files
assert(fs.existsSync(path.join(backupDir1, 'memory.json')), 'backup includes memory.json');
assert(fs.existsSync(path.join(backupDir1, 'rules.json')), 'backup includes rules.json');
assert(fs.existsSync(path.join(backupDir1, 'skill-states.json')), 'backup includes skill-states.json');

// ---- listBackups ----

// WHEN we list backups
const backups = listBackups();
assert.ok(Array.isArray(backups), 'listBackups returns an array');
assert.strictEqual(backups.length, 1, 'one backup exists');
const firstBackup = backups[0];
assert.ok(firstBackup, 'first backup entry exists');
assert.strictEqual(firstBackup.timestamp, String(backup1.timestamp), 'timestamp matches');

// GIVEN no backups directory
fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
const noBackups = listBackups();
assert.deepStrictEqual(noBackups, [], 'listBackups returns empty array when no dir');

// Recreate for restore test
writeData('memory.json', memoryObj);
writeData('rules.json', { coding: 'Use strict', general: '', soul: '' });
writeData('skill-states.json', { 'skill-a': true });
const backupForRestore = createBackup();

// ---- restoreBackup ----

// GIVEN we change the data
writeData('memory.json', { version: '1.1', entries: [] });
const changed = readData('memory.json');
assert.deepStrictEqual(changed.entries, [], 'data was changed');
// WHEN we restore from backup
const restored = restoreBackup(backupForRestore.timestamp);
assert.strictEqual(restored, true, 'restoreBackup returns true for existing backup');
// THEN the data is restored
const afterRestore = readData('memory.json');
assert.deepStrictEqual(afterRestore, memoryObj, 'data restored from backup');

// WHEN we try to restore a nonexistent backup
const restoreMiss = restoreBackup('nonexistent-timestamp');
assert.strictEqual(restoreMiss, false, 'restoreBackup returns false for missing backup');

// ---- getSessionLog ----

// GIVEN no session log
const emptyLog = getSessionLog();
assert.ok(emptyLog.sessions, 'getSessionLog returns sessions array');
assert.strictEqual(emptyLog.sessions.length, 0, 'empty log has no sessions');

// ---- appendSession ----

// WHEN we append a session entry
appendSession({ type: 'mode_apply', modeId: 'coding' });
// THEN it appears in the log
const log1 = getSessionLog();
assert.strictEqual(log1.sessions.length, 1, 'session log has one entry');
assert.strictEqual(log1.sessions[0].type, 'mode_apply', 'session type preserved');

// WHEN we append more entries
for (let i = 0; i < 60; i++) {
  appendSession({ type: 'bulk', index: i });
}
// THEN the log is capped at 50
const log2 = getSessionLog();
assert.strictEqual(log2.sessions.length, 50, 'session log is capped at 50 entries');

// GIVEN a corrupt session log
fs.writeFileSync(path.join(DATA_DIR, 'session-log.json'), 'NOT JSON', 'utf8');
const corruptLog = getSessionLog();
assert.ok(corruptLog.sessions, 'getSessionLog returns sessions for corrupt file');
assert.strictEqual(corruptLog.sessions.length, 0, 'corrupt log returns empty sessions');

// cleanup
fs.rmSync(testRoot, { recursive: true, force: true });
console.log('backup smoke ok');
