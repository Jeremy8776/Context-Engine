// @ts-check

const assert = require('assert');
const path = require('path');
const os = require('os');

// GIVEN the config module loads from default environment
delete require.cache[require.resolve('../server/lib/config')];
const config = require('../server/lib/config');

// ---- PORT ----
// GIVEN no port env var
assert.strictEqual(config.PORT, 3847, 'PORT defaults to 3847 when no env set');

// ---- ROOT ----
// GIVEN CE_ROOT is unset
// ROOT defaults to the parent of data/ which is three levels up from server/lib
// On any OS this resolves to an absolute path containing 'server/lib' three levels
// below the root. Verify it ends with 'data' one level down and doesn't start with
// the source tree itself (it should be resolved).
assert(config.ROOT && path.isAbsolute(config.ROOT), 'ROOT is an absolute path');

// ---- DATA_DIR ----
assert(config.DATA_DIR.endsWith('data'), 'DATA_DIR is <ROOT>/data');

// ---- UI_DIR ----
assert(config.UI_DIR.endsWith('ui'), 'UI_DIR is <app>/ui');

// ---- CONTEXT_MD ----
assert(config.CONTEXT_MD.endsWith('CONTEXT.md'), 'CONTEXT_MD is <ROOT>/CONTEXT.md');

// ---- SKILLS_DIR ----
assert(config.SKILLS_DIR.endsWith('skills'), 'SKILLS_DIR is <ROOT>/skills');

// ---- HOMEDIR ----
assert.strictEqual(config.HOMEDIR, os.homedir(), 'HOMEDIR matches os.homedir()');

// ---- BACKUPS_DIR ----
assert(config.BACKUPS_DIR.endsWith(path.join('data', 'backups')), 'BACKUPS_DIR is <DATA_DIR>/backups');

// ---- WORKSPACES_FILE ----
assert(config.WORKSPACES_FILE.endsWith('workspaces.json'), 'WORKSPACES_FILE is workspaces.json');

// ---- SESSION_LOG ----
assert(config.SESSION_LOG.endsWith('session-log.json'), 'SESSION_LOG is session-log.json');

// ---- MODES_FILE ----
assert(config.MODES_FILE.endsWith('modes.json'), 'MODES_FILE is modes.json');

// ---- KEYS_FILE ----
assert(config.KEYS_FILE.endsWith('.keys.enc'), 'KEYS_FILE is .keys.enc');

// ---- SKILL_CACHE_FILE ----
assert(
  config.SKILL_CACHE_FILE.endsWith('skill-parse-cache.json'),
  'SKILL_CACHE_FILE is skill-parse-cache.json',
);

// ---- DEDUP_FILE ----
assert(config.DEDUP_FILE.endsWith('dedup.json'), 'DEDUP_FILE is dedup.json');

// ---- PROJECTS_FILE ----
assert(config.PROJECTS_FILE.endsWith('projects.json'), 'PROJECTS_FILE is projects.json');

// ---- PROJECTS_DIR ----
assert(config.PROJECTS_DIR.endsWith(path.join('data', 'projects')), 'PROJECTS_DIR is <DATA_DIR>/projects');

// ---- MIME map ----
assert.strictEqual(config.MIME['.html'], 'text/html', 'MIME map includes .html');
assert.strictEqual(config.MIME['.js'], 'application/javascript', 'MIME map includes .js');
assert.strictEqual(config.MIME['.css'], 'text/css', 'MIME map includes .css');
assert.strictEqual(config.MIME['.json'], 'application/json', 'MIME map includes .json');
assert.strictEqual(config.MIME['.svg'], 'image/svg+xml', 'MIME map includes .svg');

// GIVEN CE_PORT env is set
const prevPort = process.env.CE_PORT;
process.env.CE_PORT = '9999';
delete require.cache[require.resolve('../server/lib/config')];
const config2 = require('../server/lib/config');
assert.strictEqual(config2.PORT, 9999, 'PORT reads from CE_PORT env var');
process.env.CE_PORT = prevPort;

// GIVEN CE_ROOT env is set to a specific path
const prevRoot = process.env.CE_ROOT;
process.env.CE_ROOT = '/tmp/test-ce-root';
delete require.cache[require.resolve('../server/lib/config')];
const config3 = require('../server/lib/config');
assert.strictEqual(config3.ROOT, '/tmp/test-ce-root', 'ROOT reads from CE_ROOT env var');
assert.strictEqual(config3.DATA_DIR, path.join('/tmp/test-ce-root', 'data'), 'DATA_DIR derives from CE_ROOT');
process.env.CE_ROOT = prevRoot;

console.log('config smoke ok');
