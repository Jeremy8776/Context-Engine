// @ts-check

// projects-smoke.js — Self-contained smoke test for project CRUD

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// GIVEN a fresh CE_ROOT so we test in isolation
const testRoot = path.join(os.tmpdir(), 'ce-projects-test-' + Date.now());
fs.mkdirSync(path.join(testRoot, 'data'), { recursive: true });
process.env.CE_ROOT = testRoot;

let pass = 0;
let fail = 0;

/** @param {boolean} cond @param {string} label */
function check(cond, label) {
  if (cond) {
    pass++;
    console.log(`  PASS: ${label}`);
  } else {
    fail++;
    console.log(`  FAIL: ${label}`);
  }
}

// ===================================================================
// SECTION 1: Library-level unit tests
// ===================================================================

// Clear require cache so modules pick up our CE_ROOT
delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/projects')];

const projects = require('../server/lib/projects');

// ---- listProjects ----

// GIVEN no projects exist yet
check(projects.listProjects().length === 0, 'listProjects returns empty array when no projects');

// GIVEN a registry where projects key exists but is not an array
fs.writeFileSync(projects.PROJECTS_FILE, JSON.stringify({ version: '1.0', projects: 'not-array' }), 'utf8');
const nonArrayResult = projects.listProjects();
check(Array.isArray(nonArrayResult), 'listProjects returns array when projects key is not array');
check(nonArrayResult.length === 0, 'listProjects returns empty array when projects key is not array');

// GIVEN a corrupted projects.json
fs.writeFileSync(projects.PROJECTS_FILE, 'NOT JSON', 'utf8');
const corruptResult = projects.listProjects();
check(Array.isArray(corruptResult), 'listProjects returns array when registry file is corrupt');
check(corruptResult.length === 0, 'listProjects returns empty array when registry file is corrupt');

// GIVEN projects.json doesn't exist at all
fs.rmSync(path.join(testRoot, 'data'), { recursive: true, force: true });
fs.mkdirSync(path.join(testRoot, 'data'), { recursive: true });
const missingResult = projects.listProjects();
check(Array.isArray(missingResult), 'listProjects returns array when registry file is missing');
check(missingResult.length === 0, 'listProjects returns empty array when registry file is missing');

// ---- uniqueSlug (tested via createProject) ----

// WHEN we create a project with name only
const r1 = projects.createProject({ name: 'My App' });
check(r1.ok === true, 'createProject succeeds with name only');
const p1 =
  /** @type {{ slug: string, created: string, last_touched: string, path: string | undefined, name: string }} */ (
    r1.project
  );
check(p1.slug === 'my-app', 'slug derives from name (spaces to hyphens)');
check(p1.name === 'My App', 'project stores original name');
check(typeof p1.created === 'string', 'project has created timestamp');
check(typeof p1.last_touched === 'string', 'project has last_touched timestamp');
check(p1.path === undefined, 'path is undefined when not provided');

// WHEN name has leading/trailing special chars
const rSpecial = projects.createProject({ name: '---Hello!!!World---' });
check(rSpecial.ok === true, 'createProject succeeds with special chars in name');
check(
  /** @type {{ slug: string }} */ (rSpecial.project).slug === 'hello-world',
  'slug strips leading/trailing hyphens and special chars',
);

// WHEN name is all special chars (slug falls back to "project")
const rAllSpecial = projects.createProject({ name: '!!!@@@###' });
check(rAllSpecial.ok === true, 'createProject succeeds with all-special-char name');
check(
  /** @type {{ slug: string }} */ (rAllSpecial.project).slug === 'project',
  'slug falls back to "project" when all chars are stripped',
);

// WHEN name is whitespace only
const rWhitespace = projects.createProject({ name: '   ' });
check(rWhitespace.ok === false, 'createProject fails with whitespace-only name');
check(rWhitespace.error === 'name is required', 'whitespace-only name gives "name is required" error');

// WHEN name is very long (slug truncates to 60 chars)
const longName = 'A'.repeat(100);
const rLong = projects.createProject({ name: longName });
check(rLong.ok === true, 'createProject succeeds with very long name');
check(
  /** @type {{ slug: string }} */ (rLong.project).slug.length <= 60,
  'slug is truncated to at most 60 chars',
);

// ---- createProject directory structure ----

const pDir = path.join(projects.PROJECTS_DIR, p1.slug);
check(fs.existsSync(pDir), 'project directory is created');
check(fs.existsSync(path.join(pDir, 'handoffs')), 'handoffs subdirectory is created');
check(fs.existsSync(path.join(pDir, 'memory.json')), 'memory.json seed file is created');
check(fs.existsSync(path.join(pDir, 'rules.json')), 'rules.json seed file is created');

// AND the seed files are valid JSON
const memData = JSON.parse(fs.readFileSync(path.join(pDir, 'memory.json'), 'utf8'));
check(memData.version === '1.1', 'memory.json has correct version');
check(Array.isArray(memData.entries), 'memory.json has entries array');
const rulesData = JSON.parse(fs.readFileSync(path.join(pDir, 'rules.json'), 'utf8'));
check('coding' in rulesData && 'general' in rulesData && 'soul' in rulesData, 'rules.json has expected keys');

// WHEN we create a project with name and path
const r2 = projects.createProject({ name: 'Has Path', path: 'C:\\dev\\has-path' });
check(r2.ok === true, 'createProject succeeds with name and path');
const p2 = /** @type {{ slug: string, path: string }} */ (r2.project);
check(p2.path === 'C:\\dev\\has-path', 'project stores the path');
check(p2.slug === 'has-path', 'slug derives from name with path provided');

// WHEN we create a project with whitespace-padded path
const rPadPath = projects.createProject({ name: 'Padded', path: '  C:\\dev\\pad  ' });
check(rPadPath.ok === true, 'createProject succeeds with whitespace-padded path');
check(/** @type {{ path: string }} */ (rPadPath.project).path === 'C:\\dev\\pad', 'path is trimmed');

// WHEN we create a project with empty path
const rEmptyPath = projects.createProject({ name: 'Empty Path', path: '' });
check(rEmptyPath.ok === true, 'createProject succeeds with empty path');
check(
  /** @type {{ path: string | undefined }} */ (rEmptyPath.project).path === undefined,
  'empty path becomes undefined',
);

// WHEN we create a project without a name
const rNoName = projects.createProject({ name: '' });
check(rNoName.ok === false, 'createProject fails with empty name');
check(rNoName.error === 'name is required', 'error message is "name is required"');

// WHEN we create a project with no input at all
const rNoInput = projects.createProject({});
check(rNoInput.ok === false, 'createProject fails with no input');

// ---- slug collision ----

// GIVEN a project named "duplicate" already exists
projects.createProject({ name: 'duplicate' });

// WHEN we create another project with the same name
const rDup = projects.createProject({ name: 'duplicate' });
check(rDup.ok === true, 'createProject succeeds when slug collides');
check(
  /** @type {{ slug: string }} */ (rDup.project).slug === 'duplicate-2',
  'slug gets -2 suffix on collision',
);

// WHEN we create a third duplicate
const rDup3 = projects.createProject({ name: 'duplicate' });
check(rDup3.ok === true, 'createProject succeeds on third collision');
check(
  /** @type {{ slug: string }} */ (rDup3.project).slug === 'duplicate-3',
  'slug gets -3 suffix on third collision',
);

// WHEN the "project" fallback slug already exists (created above via '!!!@@@###')
const rFallbackDup = projects.createProject({ name: '@$$%' });
check(rFallbackDup.ok === true, 'fallback slug "project" gets collision suffix');
const fallbackSlug = /** @type {{ slug: string }} */ (rFallbackDup.project).slug;
check(fallbackSlug.startsWith('project-'), 'fallback slug collision produces "project-N"');

// ---- getProject ----

const found = projects.getProject('my-app');
check(found !== null, 'getProject returns project when slug exists');
check(found && found.name === 'My App', 'getProject returns correct project name');

check(projects.getProject('no-such-slug') === null, 'getProject returns null for unknown slug');

// ---- updateProject ----

const uName = projects.updateProject('my-app', { name: 'My Updated App' });
check(uName.ok === true, 'updateProject succeeds for name');
check(
  /** @type {{ name: string, slug: string }} */ (uName.project).name === 'My Updated App',
  'name is updated',
);
check(
  /** @type {{ name: string, slug: string }} */ (uName.project).slug === 'my-app',
  'slug stays the same after name update',
);

const uPath = projects.updateProject('my-app', { path: 'C:\\new\\path' });
check(uPath.ok === true, 'updateProject succeeds for path');
check(/** @type {{ path: string }} */ (uPath.project).path === 'C:\\new\\path', 'path is updated');

const uClear = projects.updateProject('my-app', { path: '' });
check(uClear.ok === true, 'updateProject succeeds for clearing path');
check(
  /** @type {{ path: string | undefined }} */ (uClear.project).path === undefined,
  'path becomes undefined when cleared',
);

const beforeTouch = projects.getProject('my-app')?.last_touched;
const uTouch = projects.updateProject('my-app', { name: 'My Updated App' });
check(uTouch.ok === true, 'updateProject succeeds with same name');
check(
  /** @type {{ last_touched: string }} */ (uTouch.project).last_touched !== beforeTouch,
  'last_touched changes on update',
);

// WHEN we update with empty patch (no name, no path)
const uEmpty = projects.updateProject('my-app', {});
check(uEmpty.ok === true, 'updateProject succeeds with empty patch');
const uEmptyLastTouched = /** @type {{ last_touched: string }} */ (uEmpty.project).last_touched;
check(uEmptyLastTouched !== beforeTouch, 'last_touched changes even with empty patch');

const uMiss = projects.updateProject('no-such-slug', { name: 'X' });
check(uMiss.ok === false, 'updateProject fails for non-existent slug');
check(uMiss.error === 'Project not found', 'error message is "Project not found"');

// ---- deleteProject ----

const d1 = projects.deleteProject('has-path');
check(d1.ok === true, 'deleteProject succeeds for existing project');
check(!fs.existsSync(path.join(projects.PROJECTS_DIR, 'has-path')), 'project directory is removed on delete');
check(
  projects.listProjects().find(/** @param {{ slug: string }} p */ (p) => p.slug === 'has-path') === undefined,
  'deleted project no longer in listing',
);

const dMiss = projects.deleteProject('no-such-slug');
check(dMiss.ok === false, 'deleteProject fails for non-existent slug');
check(dMiss.error === 'Project not found', 'delete error is "Project not found"');

// WHEN we delete a project whose directory was already removed
const rAlreadyGone = projects.createProject({ name: 'Already Gone' });
const slugAlreadyGone = /** @type {{ slug: string }} */ (rAlreadyGone.project).slug;
fs.rmSync(path.join(projects.PROJECTS_DIR, slugAlreadyGone), { recursive: true, force: true });
const dAlreadyGone = projects.deleteProject(slugAlreadyGone);
check(dAlreadyGone.ok === true, 'deleteProject succeeds even when directory already removed');

// ===================================================================
// SECTION 2: HTTP-level integration tests
// ===================================================================

// Re-clear require cache for config so the server picks up CE_ROOT
delete require.cache[require.resolve('../server/lib/config')];
delete require.cache[require.resolve('../server/lib/backup')];
delete require.cache[require.resolve('../server/lib/projects')];

const { startServer } = require('../server/server');

const serverPort = 3857;
process.env.CE_PORT = String(serverPort);

/**
 * @param {string} method
 * @param {string} urlPath
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<{ status: number | undefined, data: unknown }>}
 */
function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: serverPort,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, data: d });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runHttpTests() {
  const server = startServer({ port: serverPort, refresh: false });
  try {
    await new Promise((resolve) => server.once('listening', resolve));

    // GET /api/projects
    const getList = await api('GET', '/api/projects');
    check(getList.status === 200, 'HTTP GET /api/projects returns 200');
    check(
      Array.isArray(/** @type {any} */ (getList.data).projects),
      'HTTP GET /api/projects returns projects array',
    );

    // POST /api/projects with valid data
    const postOk = await api('POST', '/api/projects', { name: 'HTTP Project' });
    check(postOk.status === 200, 'HTTP POST /api/projects with valid data returns 200');
    check(/** @type {any} */ (postOk.data).ok === true, 'HTTP POST /api/projects returns ok');

    const httpSlug = /** @type {any} */ (postOk.data).project?.slug;
    check(typeof httpSlug === 'string', 'HTTP POST /api/projects returns project with slug');

    // POST /api/projects with empty name
    const postFail = await api('POST', '/api/projects', { name: '' });
    check(postFail.status === 400, 'HTTP POST /api/projects with empty name returns 400');

    // PATCH /api/projects/:slug
    const patchOk = await api('PATCH', `/api/projects/${encodeURIComponent(httpSlug)}`, {
      name: 'HTTP Updated',
    });
    check(patchOk.status === 200, 'HTTP PATCH /api/projects/:slug returns 200');
    check(
      /** @type {any} */ (patchOk.data).project?.name === 'HTTP Updated',
      'HTTP PATCH updates project name',
    );

    // PATCH /api/projects/:slug with non-existent slug
    const patchMiss = await api('PATCH', '/api/projects/no-such', { name: 'X' });
    check(patchMiss.status === 404, 'HTTP PATCH non-existent project returns 404');

    // DELETE /api/projects/:slug
    const deleteOk = await api('DELETE', `/api/projects/${encodeURIComponent(httpSlug)}`);
    check(deleteOk.status === 200, 'HTTP DELETE /api/projects/:slug returns 200');
    check(/** @type {any} */ (deleteOk.data).ok === true, 'HTTP DELETE returns ok');

    // DELETE /api/projects/:slug with non-existent slug
    const deleteMiss = await api('DELETE', '/api/projects/no-such');
    check(deleteMiss.status === 404, 'HTTP DELETE non-existent project returns 404');
  } finally {
    server.close();
  }
}

// ===================================================================
// Run
// ===================================================================

void (async () => {
  try {
    await runHttpTests();
  } catch (e) {
    console.error('HTTP tests failed:', e);
  }

  // ---- cleanup ----
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
