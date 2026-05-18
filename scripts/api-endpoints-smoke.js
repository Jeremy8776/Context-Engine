const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-api-smoke-' + Date.now()));
const dataDir = path.join(testRoot, 'data');
const skillsDir = path.join(testRoot, 'skills');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(skillsDir, { recursive: true });

process.env.CE_ROOT = testRoot;
process.env.CE_PORT = '19947';

// Setup minimal skills
const skillDir = path.join(skillsDir, 'api-skill');
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(
  path.join(skillDir, 'SKILL.md'),
  '---\nname: API Skill\n---\n# API Skill\n\nFor api smoke testing.\n',
  'utf8',
);

// Clear require cache so modules pick up CE_ROOT and CE_PORT
for (const key of Object.keys(require.cache)) {
  if (key.includes(path.join('server', 'lib')) || key.includes(path.join('server', 'compiler'))) {
    delete require.cache[key];
  }
}

const { createContextServer: createServer } = require('../server/server');
const PORT = 19947;
const BASE = `http://127.0.0.1:${PORT}`;

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

/** @param {string} method @param {string} route @param {unknown} [body] @returns {Promise<{status: number, data: any}>} */
function req(method, route, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${route}`);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => {
        d += c;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode || 0, data: d });
        }
      });
    });
    r.on('error', (e) => reject(e));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // ---- Start server ----
  /** @type {import('http').Server} */
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));

  // ---- /api/health ----
  const healthResp = await req('GET', '/api/health');
  check(healthResp.status === 200, 'GET /api/health → 200');
  check(Array.isArray(healthResp.data.skills), 'GET /api/health returns skills array');
  check(typeof healthResp.data.budget === 'object', 'GET /api/health returns budget');

  // ---- /api/skills ----
  const skillsResp = await req('GET', '/api/skills');
  check(skillsResp.status === 200, 'GET /api/skills → 200');
  const skillsList = skillsResp.data;
  check(Array.isArray(skillsList), 'GET /api/skills returns array');

  // ---- /api/skills/:id ----
  // skillsList is Object.values(scanSkills()) — an array of skill objects
  if (skillsList.length > 0) {
    const skillId = skillsList[0].id;
    const skillResp = await req('GET', `/api/skills/${encodeURIComponent(skillId)}`);
    check(skillResp.status === 200, `GET /api/skills/${skillId} → 200`);
    check(skillResp.data.ok === true, `GET /api/skills/${skillId} has ok:true`);
    check(typeof skillResp.data.body === 'string', `GET /api/skills/${skillId} includes body`);
    check(Array.isArray(skillResp.data.sections), `GET /api/skills/${skillId} includes sections`);

    const sectionResp = await req('GET', `/api/skills/${encodeURIComponent(skillId)}?section=nonexistent`);
    check(sectionResp.status === 404, 'GET /api/skills/:id?section=missing → 404');
  }

  // ---- GET /api/skills/:id (404 for unknown) ----
  const unknownSkill = await req('GET', '/api/skills/nonexistent-skill-xyz');
  check(unknownSkill.status === 404, 'GET /api/skills/unknown → 404');

  // ---- /api/skills/organise ----
  const organiseResp = await req('POST', '/api/skills/organise', { apply: false });
  check(organiseResp.status === 200, 'POST /api/skills/organise → 200');
  check(organiseResp.data.ok === true, 'organise dry-run returns ok');

  // ---- /api/memory GET ----
  const memGet = await req('GET', '/api/memory');
  check(memGet.status === 200, 'GET /api/memory → 200');

  // ---- /api/memory POST ----
  const memPost = await req('POST', '/api/memory', {
    entries: [{ content: 'Test memory entry' }],
    version: '1.0',
  });
  check(memPost.status === 200, 'POST /api/memory → 200');
  check(memPost.data.ok === true, 'POST /api/memory ok');

  // ---- /api/memory POST (invalid) ----
  const memInvalid = await req('POST', '/api/memory', { bad_field: true });
  check(memInvalid.status === 400, 'POST /api/memory invalid → 400');

  // ---- /api/rules GET ----
  const rulesGet = await req('GET', '/api/rules');
  check(rulesGet.status === 200, 'GET /api/rules → 200');

  // ---- /api/rules POST ----
  const rulesPost = await req('POST', '/api/rules', {
    coding: { hard: 'test hard rule', soft: 'test soft rule' },
    general: { hard: '', soft: '' },
    soul: { soft: 'test soul' },
  });
  check(rulesPost.status === 200, 'POST /api/rules → 200');
  check(rulesPost.data.ok === true, 'POST /api/rules ok');

  // ---- /api/rules POST (invalid) ----
  const rulesInvalid = await req('POST', '/api/rules', { invalid: 'data' });
  check(rulesInvalid.status === 400, 'POST /api/rules invalid → 400');

  // ---- /api/rule-files GET ----
  const rflist = await req('GET', '/api/rule-files');
  check(rflist.status === 200, 'GET /api/rule-files → 200');
  check(rflist.data.ok === true, 'GET /api/rule-files ok');
  check(Array.isArray(rflist.data.files), 'GET /api/rule-files returns files array');

  // ---- /api/rule-files POST ----
  const rfCreate = await req('POST', '/api/rule-files', {
    name: 'my-test-rules',
    data: {
      coding: { hard: 'use strict ts', soft: '' },
      general: { hard: '', soft: 'be helpful' },
      soul: { soft: 'concise' },
    },
  });
  check(rfCreate.status === 200, 'POST /api/rule-files → 200');
  check(rfCreate.data.ok === true, 'POST /api/rule-files ok');
  check(rfCreate.data.name === 'my-test-rules', 'name sanitized');

  // ---- /api/rule-files POST (invalid) ----
  const rfCreateInvalid = await req('POST', '/api/rule-files', {
    name: 'bad',
    data: { not_rules: true },
  });
  check(rfCreateInvalid.status === 400, 'POST /api/rule-files invalid → 400');

  // ---- /api/rule-files/:name GET ----
  const rfGet = await req('GET', '/api/rule-files/my-test-rules');
  check(rfGet.status === 200, 'GET /api/rule-files/:name → 200');
  check(rfGet.data.ok === true, 'GET /api/rule-files/:name ok');
  check(rfGet.data.name === 'my-test-rules', 'name matches');

  // ---- /api/rule-files/:name GET (404) ----
  const rfGet404 = await req('GET', '/api/rule-files/no-such-file');
  check(rfGet404.status === 404, 'GET /api/rule-files/missing → 404');

  // ---- /api/rule-files/:name PUT ----
  const rfPut = await req('PUT', '/api/rule-files/my-test-rules', {
    coding: { hard: 'updated rule', soft: '' },
    general: { hard: '', soft: '' },
    soul: { soft: '' },
  });
  check(rfPut.status === 200, 'PUT /api/rule-files/:name → 200');
  check(rfPut.data.ok === true, 'PUT ok');

  // ---- /api/rule-files/:name DELETE ----
  const rfDel = await req('DELETE', '/api/rule-files/my-test-rules');
  check(rfDel.status === 200, 'DELETE /api/rule-files/:name → 200');
  check(rfDel.data.ok === true, 'DELETE ok');

  // Verify deleted
  const rfGetDel = await req('GET', '/api/rule-files/my-test-rules');
  check(rfGetDel.status === 404, 'GET after delete → 404');

  // ---- /api/keys/status ----
  const keyStatus = await req('GET', '/api/keys/status');
  check(keyStatus.status === 200, 'GET /api/keys/status → 200');
  check(typeof keyStatus.data.ANTHROPIC_API_KEY === 'boolean', 'has ANTHROPIC_API_KEY bool');

  // ---- /api/keys POST (invalid) ----
  const keyInvalid = await req('POST', '/api/keys', {});
  check(keyInvalid.status === 400, 'POST /api/keys empty → 400');

  // ---- /api/keys DELETE ----
  // DELETE /api/keys requires { name } body
  const keyDelMissing = await req('DELETE', '/api/keys', {});
  check(keyDelMissing.status === 400, 'DELETE /api/keys without name → 400');

  // ---- /api/states GET ----
  const statesGet = await req('GET', '/api/states');
  check(statesGet.status === 200, 'GET /api/states → 200');
  check(typeof statesGet.data.states === 'object', 'states has states object');

  // ---- /api/states POST ----
  const statesPost = await req('POST', '/api/states', {
    states: { 'api-skill': true },
    version: '1.0',
  });
  check(statesPost.status === 200, 'POST /api/states → 200');
  check(statesPost.data.ok === true, 'POST /api/states ok');

  // ---- /api/states POST (invalid — non-boolean values) ----
  const statesInvalid = await req('POST', '/api/states', { states: { 'skill-x': 'not-boolean' } });
  check(statesInvalid.status === 400, 'POST /api/states invalid → 400');

  // ---- /api/context-md GET ----
  const ctxmd = await req('GET', '/api/context-md');
  check(ctxmd.status === 200, 'GET /api/context-md → 200');
  check(typeof ctxmd.data.content === 'string', 'context-md has content');

  // ---- /api/context-md POST ----
  const ctxmdPost = await req('POST', '/api/context-md');
  check(ctxmdPost.status === 200, 'POST /api/context-md → 200');
  check(ctxmdPost.data.ok === true, 'POST /api/context-md ok');

  // ---- /api/backups GET ----
  const backupsGet = await req('GET', '/api/backups');
  check(backupsGet.status === 200, 'GET /api/backups → 200');
  check(Array.isArray(backupsGet.data.backups), 'backups has backups array');

  // ---- /api/backups POST ----
  const backupPost = await req('POST', '/api/backups');
  check(backupPost.status === 200, 'POST /api/backups → 200');
  check(backupPost.data.ok === true, 'POST /api/backups ok');
  check(typeof backupPost.data.timestamp === 'string', 'backup has timestamp');

  // ---- /api/restore POST ----
  const restore = await req('POST', '/api/restore', { timestamp: backupPost.data.timestamp });
  check(restore.status === 200, 'POST /api/restore → 200');

  // ---- /api/session-log GET ----
  const sessionLog = await req('GET', '/api/session-log');
  check(sessionLog.status === 200, 'GET /api/session-log → 200');

  // ---- /api/session-log POST ----
  const sessionPost = await req('POST', '/api/session-log', { type: 'test', count: 1 });
  check(sessionPost.status === 200, 'POST /api/session-log → 200');
  check(sessionPost.data.ok === true, 'session log post ok');

  // ---- /api/session-log POST (invalid) ----
  const sessionInvalid = await req('POST', '/api/session-log', { not_type: true });
  check(sessionInvalid.status === 400, 'POST /api/session-log invalid → 400');

  // ---- /api/modes GET ----
  const modesGet = await req('GET', '/api/modes');
  check(modesGet.status === 200, 'GET /api/modes → 200');

  // ---- /api/modes POST ----
  const modesPost = await req('POST', '/api/modes', {
    modes: [{ id: 'test-mode', name: 'Test', skills: { 'api-skill': true } }],
  });
  check(modesPost.status === 200, 'POST /api/modes → 200');
  check(modesPost.data.ok === true, 'modes post ok');

  // ---- /api/modes POST (invalid) ----
  const modesInvalid = await req('POST', '/api/modes', { not_modes: true });
  check(modesInvalid.status === 400, 'POST /api/modes invalid → 400');

  // ---- /api/modes/apply POST ----
  const modeApply = await req('POST', '/api/modes/apply', { modeId: 'test-mode' });
  check(modeApply.status === 200, 'POST /api/modes/apply → 200');
  check(modeApply.data.ok === true, 'mode apply ok');

  // ---- /api/modes/apply POST (unknown) ----
  const modeApply404 = await req('POST', '/api/modes/apply', { modeId: 'no-such-mode' });
  check(modeApply404.status === 404, 'POST /api/modes/apply unknown → 404');

  // ---- /api/compile/targets ----
  const compileTargets = await req('GET', '/api/compile/targets');
  check(compileTargets.status === 200, 'GET /api/compile/targets → 200');
  check(Array.isArray(compileTargets.data.targets), 'compile targets is array (in .targets)');
  check(compileTargets.data.targets.length >= 22, 'compile targets has 22+ entries');

  // ---- /api/compile/preview ----
  const compilePreview = await req('POST', '/api/compile/preview', { targets: ['claude'] });
  check(compilePreview.status === 200, 'POST /api/compile/preview → 200');
  check(compilePreview.data.results?.claude, 'preview has claude result');

  // ---- /api/compile ----
  // compile requires outputDir — missing it should return 400 with instructions
  const compileExec = await req('POST', '/api/compile', { targets: ['claude'] });
  check(compileExec.status === 400, 'POST /api/compile without outputDir → 400');
  check(typeof compileExec.data.error === 'string', 'compile: error message provided');

  // ---- /api/onboarding ----
  const onboard = await req('GET', '/api/onboarding');
  check(onboard.status === 200, 'GET /api/onboarding → 200');
  check(onboard.data.ok === true, 'onboarding ok');
  check(typeof onboard.data.shouldShow === 'boolean', 'onboarding has shouldShow');

  // ---- /api/onboarding/complete ----
  const onboardComplete = await req('POST', '/api/onboarding/complete');
  check(onboardComplete.status === 200, 'POST /api/onboarding/complete → 200');

  // ---- /api/onboarding/reset ----
  const onboardReset = await req('POST', '/api/onboarding/reset');
  check(onboardReset.status === 200, 'POST /api/onboarding/reset → 200');

  // ---- /api/mcp/hosts ----
  const mcpHosts = await req('GET', '/api/mcp/hosts');
  check(mcpHosts.status === 200, 'GET /api/mcp/hosts → 200');

  // ---- /api/mcp/hosts/install (missing hostId) ----
  const mcpInstall = await req('POST', '/api/mcp/hosts/install', {});
  check(mcpInstall.status === 400, 'POST /api/mcp/hosts/install missing hostId → 400');

  // ---- /api/tools/detect ----
  const toolsDetect = await req('GET', '/api/tools/detect');
  check(toolsDetect.status === 200, 'GET /api/tools/detect → 200');
  check(typeof toolsDetect.data === 'object', 'tools detect returns object');

  // ---- /api/tools/install-global ----
  const toolsInstall = await req('POST', '/api/tools/install-global', { targets: ['claude'] });
  check(toolsInstall.status === 200, 'POST /api/tools/install-global → 200');

  // ---- /api/workspaces GET ----
  // Returns the raw content of workspaces.json which is { version, workspaces: [...] }
  const workspaces = await req('GET', '/api/workspaces');
  check(workspaces.status === 200, 'GET /api/workspaces → 200');
  check(workspaces.data && typeof workspaces.data === 'object', 'workspaces returns object');
  check(Array.isArray(workspaces.data.workspaces), 'workspaces.workspaces is array');

  // ---- /api/workspaces POST ----
  const wsAdd = await req('POST', '/api/workspaces', {
    action: 'add',
    path: testRoot,
    label: 'Test Workspace',
  });
  check(wsAdd.status === 200, 'POST /api/workspaces add → 200');

  // ---- /api/workspaces/compile ----
  const wsCompile = await req('POST', '/api/workspaces/compile', {
    targets: ['claude'],
    workspaceIndex: 0,
  });
  check(wsCompile.status === 200, 'POST /api/workspaces/compile → 200');

  // ---- /api/llm/ollama-models ----
  const ollamaModels = await req('GET', '/api/llm/ollama-models');
  check(ollamaModels.status === 200, 'GET /api/llm/ollama-models → 200');

  // ---- /api/app-version ----
  const appVersion = await req('GET', '/api/app-version');
  check(appVersion.status === 200, 'GET /api/app-version → 200');
  check(appVersion.data.ok === true, 'app-version ok');
  check(typeof appVersion.data.version === 'string', 'app-version has version');

  // ---- /api/docs ----
  const docsResp = await req('GET', '/api/docs');
  check(docsResp.status === 200, 'GET /api/docs → 200');
  check(typeof docsResp.data.version === 'string', 'docs has version');

  // ---- /api/skill-sources GET ----
  const skillSources = await req('GET', '/api/skill-sources');
  check(skillSources.status === 200, 'GET /api/skill-sources → 200');
  check(Array.isArray(skillSources.data.sources), 'skill-sources returns sources array');

  // ---- /api/skill-sources POST (invalid) ----
  const ssInvalid = await req('POST', '/api/skill-sources', {});
  check(ssInvalid.status === 400, 'POST /api/skill-sources empty → 400');

  // ---- /api/skill-sources/scan ----
  const ssScan = await req('GET', '/api/skill-sources/scan');
  check(ssScan.status === 200, 'GET /api/skill-sources/scan → 200');
  check(Array.isArray(ssScan.data.candidates), 'scan returns candidates array');

  // ---- / (root) ----
  const rootResp = await req('GET', '/');
  check(rootResp.status === 200, 'GET / → 200');

  // ---- Cleanup ----
  server.close();
  fs.rmSync(testRoot, { recursive: true, force: true });

  console.log(`\n${pass}/${pass + fail} tests passed`);
  if (fail > 0) {
    console.error(`${fail} test(s) failed`);
    process.exitCode = 1;
  }
  console.log('api-endpoints smoke ok');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
