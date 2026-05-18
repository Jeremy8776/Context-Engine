// @ts-check

const assert = require('assert');

const { apiDocs } = require('../server/lib/api-docs');

// GIVEN no extra endpoints
const docs = apiDocs();
assert.strictEqual(docs.version, '0.3.1', 'apiDocs returns version');
assert(Array.isArray(docs.endpoints), 'apiDocs returns endpoints array');
assert(docs.endpoints.length > 20, 'apiDocs has many built-in endpoints');

// GIVEN each endpoint has the expected shape
for (const ep of docs.endpoints) {
  assert(typeof ep.method === 'string', `endpoint ${ep.path} has method`);
  assert(typeof ep.path === 'string', `endpoint ${ep.path} has path`);
  assert(typeof ep.description === 'string', `endpoint ${ep.path} has description`);
  assert(
    ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(ep.method),
    `endpoint ${ep.path} method is valid`,
  );
  assert(ep.path.startsWith('/api/'), `endpoint ${ep.path} starts with /api/`);
  assert(ep.description.length > 0, `endpoint ${ep.path} has non-empty description`);
}

// GIVEN extra endpoints are appended
const extras = [
  { method: 'GET', path: '/api/custom/foo', description: 'Custom foo endpoint' },
  { method: 'POST', path: '/api/custom/bar', description: 'Custom bar endpoint' },
];
const extrasCount = docs.endpoints.length;
const docsWithExtras = apiDocs(extras);
// Extras are inserted before the onboarding/mcp/keys trailing block, not at the end.
// Verify they appear somewhere in the result.
const extrasFound = docsWithExtras.endpoints.filter(
  (ep) => ep.path === '/api/custom/foo' || ep.path === '/api/custom/bar',
);
assert.strictEqual(extrasFound.length, 2, 'extra endpoints appear in result');
assert(docsWithExtras.endpoints.length > extrasCount, 'extra endpoints increase total count');

// GIVEN specific endpoints exist
const paths = new Set(docs.endpoints.map((ep) => `${ep.method} ${ep.path}`));
const required = [
  'GET /api/skills',
  'GET /api/skills/:id',
  'POST /api/skills/ingest',
  'POST /api/skills/parse',
  'POST /api/skills/organise',
  'POST /api/skills/review-similar',
  'GET /api/skill-sources',
  'POST /api/skill-sources',
  'GET /api/memory',
  'POST /api/memory',
  'GET /api/rules',
  'POST /api/rules',
  'GET /api/states',
  'POST /api/states',
  'GET /api/context-md',
  'POST /api/context-md',
  'GET /api/compile/targets',
  'POST /api/compile/preview',
  'POST /api/compile',
  'GET /api/health',
  'GET /api/backups',
  'POST /api/backups',
  'POST /api/restore',
  'GET /api/modes',
  'POST /api/modes/apply',
  'GET /api/keys/status',
  'POST /api/keys',
  'DELETE /api/keys',
  'GET /api/onboarding',
  'POST /api/onboarding/complete',
  'GET /api/mcp/hosts',
  'POST /api/mcp/hosts/install',
  'GET /api/tools/detect',
  'GET /api/workspaces',
  'GET /api/app-version',
];
for (const r of required) {
  assert(paths.has(r), `apiDocs includes ${r}`);
}

console.log('api-docs smoke ok');
