// @ts-nocheck ├ö├ç├Â Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// router.js ├ö├ç├Â API route handlers for Context Engine v3

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR, SKILLS_DIR, CONTEXT_MD, HOMEDIR, WORKSPACES_FILE } = require('./lib/config');
const { body, json } = require('./lib/http');
const {
  getApiKey,
  setApiKey,
  removeApiKey,
  generateApiToken,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
} = require('./lib/crypto');
const { validateMemory, validateRules, validateStates } = require('./lib/validation');
const {
  scanSkills,
  invalidateSkillCache,
  skillHealthCheck,
  countSkillFiles,
  parseAllNeedingParse,
  llmReviewSimilarSkills,
  pruneDuplicateSkillDirs,
  organiseSkills,
  getOllamaModels,
} = require('./lib/skills');
const {
  readData,
  writeData,
  createBackup,
  listBackups,
  restoreBackup,
  getSessionLog,
  appendSession,
} = require('./lib/backup');
const { getModes, regenerateCONTEXTmd, applyMode, estimateContextBudget } = require('./lib/modes');
const {
  compile,
  buildContext,
  estimateTokens,
  getAvailableTargets,
  compileToGlobal,
  ADAPTERS,
  TOOL_REGISTRY,
} = require('./compiler');
const { detectTools } = require('./lib/tool-detection');
const { getAppVersion } = require('./lib/app-version');
const { buildHostConfigs, installHostConfig } = require('./lib/mcp-host-config');
const { getOnboardingSummary, completeOnboarding, resetOnboarding } = require('./lib/onboarding');
const { checkSafeWritePath } = require('./lib/security');
const { handleIntelligenceRequest, intelligenceRouteDocs } = require('./lib/intelligence-routes');
const {
  listSources: listSkillSources,
  addSource: addSkillSource,
  removeSource: removeSkillSource,
  scanHostSkillPaths,
} = require('./lib/skill-sources');
const {
  importSource: importSkillSource,
  computeSyncDiff: computeSkillSyncDiff,
  applySyncDiff: applySkillSyncDiff,
  readManifest: readSkillImportManifest,
} = require('./lib/skill-import');
const { markIndexStale } = require('./lib/vectorstore');
const {
  listRuleFiles,
  readRuleFile,
  writeRuleFile,
  deleteRuleFile,
  combineRuleFiles,
} = require('./lib/rule-files');
const { listProjects, getProject, createProject, updateProject, deleteProject } = require('./lib/projects');
const { handleHandoffRequest, handoffRouteDocs } = require('./lib/handoff-routes');
const { apiDocs } = require('./lib/api-docs');

const ALLOWED_INGEST_HOSTS = new Set(['github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org']);

const ingestJobs = {};
const INGEST_JOB_TTL = 10 * 60 * 1000; // 10 minutes

function cleanupIngestJobs() {
  const now = Date.now();
  for (const [id, job] of Object.entries(ingestJobs)) {
    if (job.createdAt && now - job.createdAt > INGEST_JOB_TTL) delete ingestJobs[id];
  }
}

async function handleRequest(req, res, url) {
  const p = url.pathname;

  // ---- LOCAL AUTH ----
  // Auth endpoints are exempt from the Bearer token check in server.js
  if (p === '/api/auth/status' && req.method === 'GET') {
    const token = getAuthToken();
    return json(res, { configured: !!token });
  }
  if (p === '/api/auth/generate' && req.method === 'POST') {
    const token = generateApiToken();
    setAuthToken(token);
    return json(res, { ok: true, token });
  }
  if (p === '/api/auth/remove' && req.method === 'POST') {
    removeAuthToken();
    return json(res, { ok: true });
  }

  // ---- SKILLS ----
  if (p === '/api/skills' && req.method === 'GET') return json(res, Object.values(scanSkills()));

  // GET /api/skills/:id ├ö├ç├Â full skill record + body, optionally a single section.
  // Used by the MCP bridge so hosts (Claude Desktop, Codex) can fetch a skill
  // body on demand instead of preloading every active skill into context.
  if (p.startsWith('/api/skills/') && req.method === 'GET') {
    const rest = decodeURIComponent(p.replace('/api/skills/', ''));
    // Block reserved subpaths (ingest job lookup is GET /api/skills/ingest/:jobId).
    if (!rest || rest.startsWith('ingest/')) return null;
    const skill = scanSkills()[rest];
    if (!skill) return json(res, { ok: false, error: 'Unknown skill: ' + rest }, 404);

    let body = '';
    try {
      body = fs.readFileSync(skill.path, 'utf8');
    } catch (e) {
      return json(res, { ok: false, error: 'Failed to read SKILL.md: ' + e.message }, 500);
    }

    // Build a lightweight section index from `## ` headings so callers can
    // ask for one slice without parsing the whole body themselves.
    const sections = [];
    const lines = body.split(/\r?\n/);
    let currentHeading = null;
    let currentStart = 0;
    lines.forEach((line, i) => {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) {
        if (currentHeading)
          sections.push({ heading: currentHeading, startLine: currentStart, endLine: i - 1 });
        currentHeading = m[1].trim();
        currentStart = i;
      }
    });
    if (currentHeading)
      sections.push({ heading: currentHeading, startLine: currentStart, endLine: lines.length - 1 });

    const sectionParam = url.searchParams.get('section');
    if (sectionParam) {
      const wanted = sectionParam.toLowerCase();
      const match = sections.find((s) => s.heading.toLowerCase() === wanted);
      if (!match)
        return json(
          res,
          {
            ok: false,
            error: `Section not found: ${sectionParam}`,
            availableSections: sections.map((s) => s.heading),
          },
          404,
        );
      const slice = lines.slice(match.startLine, match.endLine + 1).join('\n');
      return json(res, { ok: true, skill, section: match.heading, body: slice });
    }

    return json(res, { ok: true, skill, body, sections: sections.map((s) => s.heading) });
  }

  if (p === '/api/skills/parse' && req.method === 'POST') {
    const data = await body(req);
    if ((data?.provider || 'anthropic') === 'anthropic' && !data?.apiKey && !getApiKey('ANTHROPIC_API_KEY')) {
      return json(
        res,
        { ok: false, error: 'No API key configured. Add one in Rules or paste one in cleanup settings.' },
        400,
      );
    }
    try {
      const result = await parseAllNeedingParse(data || {});
      if (!result.total) return json(res, { ok: true, parsed: 0, message: 'All skills already parsed' });
      return json(res, { ok: true, parsed: result.parsed, total: result.total });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  // ---- SKILL SOURCES ----
  // Registry of external skill directories. The implicit `internal` source
  // (CE_ROOT/skills) is always returned first; user-linked sources follow.
  if (p === '/api/skill-sources' && req.method === 'GET') {
    const sources = listSkillSources().map((src) => {
      // Attach a live skill count per source so the onboarding UI can
      // surface "12 skills at ~/.claude/skills" without a second probe.
      let skillCount = 0;
      try {
        skillCount = countSkillFiles(src.path);
      } catch {
        skillCount = 0;
      }
      // Imported state is derived from manifest presence ├ö├ç├Â the user's source
      // record stays `external`; importing is a runtime aspect, not a type.
      let imported = false;
      let lastSyncedAt = null;
      let aggregateStrategy = null;
      let fileCount = 0;
      if (src.type !== 'internal') {
        const manifest = readSkillImportManifest(src.id);
        if (manifest) {
          imported = true;
          lastSyncedAt = manifest.lastSyncedAt;
          aggregateStrategy = manifest.aggregateStrategy;
          fileCount = manifest.files.length;
        }
      }
      return { ...src, skillCount, imported, lastSyncedAt, aggregateStrategy, fileCount };
    });
    return json(res, { sources });
  }

  if (p === '/api/skill-sources' && req.method === 'POST') {
    const data = await body(req);
    const result = await addSkillSource({ path: data?.path, label: data?.label });
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    invalidateSkillCache();
    markIndexStale('Linked a new skill source');
    return json(res, { ok: true, source: result.source });
  }

  if (p === '/api/skill-sources/scan' && req.method === 'GET') {
    return json(res, { candidates: scanHostSkillPaths() });
  }

  // POST /api/skill-sources/:id/import ├ö├ç├Â first-time import (copy/hard-link
  // into <CE_ROOT>/skills/imported/<id>/).
  if (p.startsWith('/api/skill-sources/') && p.endsWith('/import') && req.method === 'POST') {
    const id = decodeURIComponent(p.slice('/api/skill-sources/'.length, -'/import'.length));
    if (!id) return json(res, { ok: false, error: 'id is required' }, 400);
    const result = await importSkillSource(id);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    invalidateSkillCache();
    markIndexStale('Imported a skill source');
    return json(res, { ok: true, manifest: result.manifest });
  }

  // GET /api/skill-sources/:id/sync ├ö├ç├Â read-only diff.
  if (p.startsWith('/api/skill-sources/') && p.endsWith('/sync') && req.method === 'GET') {
    const id = decodeURIComponent(p.slice('/api/skill-sources/'.length, -'/sync'.length));
    if (!id) return json(res, { ok: false, error: 'id is required' }, 400);
    const result = computeSkillSyncDiff(id);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true, diff: result.diff, manifest: result.manifest });
  }

  // POST /api/skill-sources/:id/sync/apply ├ö├ç├Â apply the diff with a mode.
  if (p.startsWith('/api/skill-sources/') && p.endsWith('/sync/apply') && req.method === 'POST') {
    const id = decodeURIComponent(p.slice('/api/skill-sources/'.length, -'/sync/apply'.length));
    if (!id) return json(res, { ok: false, error: 'id is required' }, 400);
    const data = await body(req);
    const result = await applySkillSyncDiff(id, data?.mode);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    invalidateSkillCache();
    // Only mark stale if something actually changed on disk. A no-op sync
    // shouldn't trigger a rebuild prompt.
    const touched =
      (result.applied?.added || 0) + (result.applied?.removed || 0) + (result.applied?.modified || 0);
    if (touched > 0) markIndexStale('Synced a skill source');
    return json(res, { ok: true, applied: result.applied, manifest: result.manifest });
  }

  // DELETE /api/skill-sources/:id ├ö├ç├Â must come AFTER more-specific sub-routes.
  if (p.startsWith('/api/skill-sources/') && req.method === 'DELETE') {
    const id = decodeURIComponent(p.replace('/api/skill-sources/', ''));
    if (!id || id === 'scan') return json(res, { ok: false, error: 'id is required' }, 400);
    // removeSkillSource is async and routes through the per-source mutex so
    // unlink waits for any in-flight import/sync on the same id; the manifest
    // forget happens inside the same lock to avoid orphan trees.
    const result = await removeSkillSource(id);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    invalidateSkillCache();
    markIndexStale('Unlinked a skill source');
    return json(res, { ok: true });
  }

  if (p === '/api/skills/organise' && req.method === 'POST') {
    const data = await body(req);
    const result = organiseSkills({ apply: data?.apply === true });
    return json(res, result);
  }

  if (p === '/api/skills/review-similar' && req.method === 'POST') {
    const data = await body(req);
    const result = await llmReviewSimilarSkills(data || {});
    return json(res, result, result.ok ? 200 : 400);
  }

  if (p === '/api/llm/ollama-models' && req.method === 'GET') {
    const models = await getOllamaModels();
    return json(res, { ok: true, models });
  }

  if (p === '/api/app-version' && req.method === 'GET') {
    return json(res, { ok: true, ...getAppVersion() });
  }

  // ---- ONBOARDING ----
  if (p === '/api/onboarding' && req.method === 'GET') {
    const tools = detectTools(HOMEDIR, {
      dataDir: DATA_DIR,
      skillsDir: SKILLS_DIR,
      scanSkills,
      adapters: ADAPTERS,
      buildContext,
      estimateTokens,
    });
    return json(res, { ok: true, ...getOnboardingSummary({ tools }) });
  }

  if (p === '/api/onboarding/complete' && req.method === 'POST') {
    return json(res, completeOnboarding());
  }

  if (p === '/api/onboarding/reset' && req.method === 'POST') {
    return json(res, resetOnboarding());
  }

  // ---- MCP HOST CONFIG ----
  if (p === '/api/mcp/hosts' && req.method === 'GET') {
    return json(res, { ok: true, hosts: buildHostConfigs() });
  }

  if (p === '/api/mcp/hosts/install' && req.method === 'POST') {
    const data = await body(req);
    const hostId = String(data?.hostId || '').trim();
    if (!hostId) return json(res, { ok: false, error: 'hostId is required' }, 400);
    const result = installHostConfig(hostId);
    return json(res, result, result.ok ? 200 : 409);
  }

  const intelligenceResult = await handleIntelligenceRequest(req, res, url, { scanSkills });
  if (intelligenceResult !== null) return intelligenceResult;

  // ---- SKILL INGEST (GitHub clone) ----
  if (p === '/api/skills/ingest' && req.method === 'POST') {
    const data = await body(req);
    let repoUrl = data?.url;
    if (!repoUrl || typeof repoUrl !== 'string' || !/^https:\/\//i.test(repoUrl)) {
      return json(res, { ok: false, error: 'Invalid URL ├ö├ç├Â must be https://' }, 400);
    }
    repoUrl = repoUrl
      .replace(/\/tree\/[^/]+.*$/, '')
      .replace(/\.git$/, '')
      .replace(/\/+$/, '');
    let parsedUrl;
    try {
      parsedUrl = new URL(repoUrl);
    } catch {
      return json(res, { ok: false, error: 'Invalid URL' }, 400);
    }
    const host = parsedUrl.hostname.toLowerCase();
    if (!ALLOWED_INGEST_HOSTS.has(host)) {
      return json(
        res,
        { ok: false, error: `Host not allowed: ${host}. Allowed: ${[...ALLOWED_INGEST_HOSTS].join(', ')}` },
        400,
      );
    }
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length < 2)
      return json(res, { ok: false, error: 'Invalid repo URL ├ö├ç├Â need owner/repo' }, 400);
    // Reject anything that could escape the ingested/ directory after slugification.
    const owner = segments[0];
    const repo = segments[1];
    if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
      return json(res, { ok: false, error: 'Invalid owner/repo characters' }, 400);
    }
    const slug = `${owner}-${repo}`.toLowerCase();
    const jobId = 'ingest_' + Date.now();
    const destDir = path.join(SKILLS_DIR, 'ingested', slug);
    cleanupIngestJobs();
    ingestJobs[jobId] = { status: 'running', log: [], count: 0, createdAt: Date.now() };
    const job = ingestJobs[jobId];
    job.log.push(`Cloning ${repoUrl}...`);

    const finishJob = (git) => {
      let stderr = '';
      git.stdout.on('data', (d) => job.log.push(d.toString().trim()));
      git.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      git.on('close', (code) => {
        if (code !== 0) {
          job.log.push(`Error: ${stderr.trim() || 'git exited ' + code}`);
          job.status = 'error';
          return;
        }
        const dedupe = pruneDuplicateSkillDirs(destDir);
        dedupe.removed.forEach((item) => job.log.push(`Skipped duplicate: ${item.id} (${item.reason})`));
        job.count = countSkillFiles(destDir);
        if (dedupe.kept.length) job.log.push(`Imported: ${dedupe.kept.length} unique skill(s)`);
        job.log.push(`Found: ${job.count} skill(s)`);
        job.log.push('Done');
        job.status = 'done';
        invalidateSkillCache();
      });
    };

    if (fs.existsSync(destDir)) {
      job.log.push('Directory exists, pulling latest...');
      finishJob(spawn('git', ['-C', destDir, 'pull']));
    } else {
      finishJob(spawn('git', ['clone', '--depth', '1', repoUrl, destDir]));
    }
    return json(res, { ok: true, jobId });
  }

  if (p.startsWith('/api/skills/ingest/') && req.method === 'GET') {
    const jobId = p.split('/').pop();
    const job = ingestJobs[jobId];
    if (!job) return json(res, { ok: false, error: 'Job not found' }, 404);
    return json(res, { ok: true, status: job.status, log: job.log, count: job.count });
  }

  // ---- MEMORY ----
  if (p === '/api/memory' && req.method === 'GET') return json(res, readData('memory.json'));
  if (p === '/api/memory' && req.method === 'POST') {
    const data = await body(req);
    const v = validateMemory(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    writeData('memory.json', data);
    return json(res, { ok: true });
  }

  // ---- RULES ----
  if (p === '/api/rules' && req.method === 'GET') return json(res, readData('rules.json'));
  if (p === '/api/rules' && req.method === 'POST') {
    const data = await body(req);
    const v = validateRules(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    writeData('rules.json', data);
    return json(res, { ok: true });
  }

  // ---- RULE FILES ----
  if (p === '/api/rule-files' && req.method === 'GET') {
    return json(res, { ok: true, files: listRuleFiles() });
  }
  if (p === '/api/rule-files' && req.method === 'POST') {
    const { name, data } = await body(req);
    if (!name) return json(res, { ok: false, error: 'Rule name is required' }, 400);
    const v = validateRules(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    const result = writeRuleFile(name, data);
    return json(res, result, result.ok ? 200 : 400);
  }
  if (p.startsWith('/api/rule-files/') && req.method === 'GET') {
    const name = decodeURIComponent(p.slice('/api/rule-files/'.length));
    const data = readRuleFile(name);
    if (!data) return json(res, { ok: false, error: 'Rule file not found' }, 404);
    return json(res, { ok: true, name, data });
  }
  if (p.startsWith('/api/rule-files/') && req.method === 'PUT') {
    const name = decodeURIComponent(p.slice('/api/rule-files/'.length));
    const data = await body(req);
    const v = validateRules(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    const result = writeRuleFile(name, data);
    return json(res, result, result.ok ? 200 : 400);
  }
  if (p.startsWith('/api/rule-files/') && req.method === 'DELETE') {
    const name = decodeURIComponent(p.slice('/api/rule-files/'.length));
    const result = deleteRuleFile(name);
    return json(res, result, result.ok ? 200 : 400);
  }

  // ---- API KEYS ----
  if (p === '/api/keys/status' && req.method === 'GET') {
    return json(res, { ANTHROPIC_API_KEY: !!getApiKey('ANTHROPIC_API_KEY') });
  }
  if (p === '/api/keys' && req.method === 'POST') {
    const data = await body(req);
    if (!data || data._parseError) return json(res, { ok: false, error: 'Invalid JSON body' }, 400);
    if (!data?.name || !data?.value) return json(res, { ok: false, error: 'Missing name or value' }, 400);
    const allowed = ['ANTHROPIC_API_KEY'];
    if (!allowed.includes(data.name)) return json(res, { ok: false, error: 'Unknown key name' }, 400);
    if (data.name === 'ANTHROPIC_API_KEY' && !data.value.startsWith('sk-ant-')) {
      return json(res, { ok: false, error: 'Invalid key format ├ö├ç├Â should start with sk-ant-' }, 400);
    }
    setApiKey(data.name, data.value);
    return json(res, { ok: true });
  }
  if (p === '/api/keys' && req.method === 'DELETE') {
    const data = await body(req);
    if (!data?.name) return json(res, { ok: false, error: 'Missing key name' }, 400);
    removeApiKey(data.name);
    return json(res, { ok: true });
  }

  // ---- STATES ----
  if (p === '/api/states' && req.method === 'GET') {
    const states = readData('skill-states.json') || {};
    const stateMap = states.states || states;
    // Ensure every discovered skill appears in the response so the UI
    // never loses sight of a skill just because it's missing from the file.
    const SKILL_MAP = scanSkills();
    const merged = typeof stateMap === 'object' && !Array.isArray(stateMap) ? { ...stateMap } : {};
    for (const id of Object.keys(SKILL_MAP)) {
      if (!(id in merged)) merged[id] = true;
    }
    return json(res, {
      version: states.version || '1.0',
      last_updated: states.last_updated || '',
      states: merged,
    });
  }
  if (p === '/api/states' && req.method === 'POST') {
    const data = await body(req);
    const v = validateStates(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    // Merge in any discovered skills missing from the posted states so they
    // default to active instead of vanishing from the UI.
    const SKILL_MAP = scanSkills();
    const incomingStates = data.states || data;
    if (typeof incomingStates === 'object' && !Array.isArray(incomingStates)) {
      for (const id of Object.keys(SKILL_MAP)) {
        if (!(id in incomingStates)) incomingStates[id] = true;
      }
    }
    const backup = readData('skill-states.json');
    try {
      writeData('skill-states.json', data);
      const regen = regenerateCONTEXTmd();
      appendSession({ type: 'toggle', activeSkills: regen.activeCount });
      return json(res, { ok: true, ...regen });
    } catch (e) {
      if (backup) {
        writeData('skill-states.json', backup);
        try {
          regenerateCONTEXTmd();
        } catch (rollbackErr) {
          // Rollback regen failure is rare but observable matters: the on-disk
          // states were restored, but CONTEXT.md may now be out of sync with
          // them until the next manual rebuild.
          const rollbackMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          console.error('[router] skill-state rollback CONTEXT.md regen failed:', rollbackMsg);
        }
      }
      return json(res, { ok: false, error: 'State update failed: ' + e.message }, 500);
    }
  }

  // ---- CONTEXT.MD ----
  if (p === '/api/context-md' && req.method === 'GET') {
    try {
      return json(res, { content: fs.readFileSync(CONTEXT_MD, 'utf8'), ...estimateContextBudget() });
    } catch {
      return json(res, { content: '', error: 'File not found' });
    }
  }
  if (p === '/api/context-md' && req.method === 'POST') {
    const r = regenerateCONTEXTmd();
    appendSession({ type: 'manual_regen', ...r });
    return json(res, { ok: true, ...r });
  }

  // ---- HEALTH ----
  if (p === '/api/health' && req.method === 'GET')
    return json(res, { skills: skillHealthCheck(), budget: estimateContextBudget() });

  // ---- BACKUPS ----
  if (p === '/api/backups' && req.method === 'GET') return json(res, { backups: listBackups() });
  if (p === '/api/backups' && req.method === 'POST') {
    const b = createBackup();
    appendSession({ type: 'backup', timestamp: b.timestamp });
    return json(res, { ok: true, ...b });
  }
  if (p === '/api/restore' && req.method === 'POST') {
    const { timestamp } = await body(req);
    if (!timestamp || typeof timestamp !== 'string') {
      return json(res, { ok: false, error: 'timestamp is required' }, 400);
    }
    const known = listBackups();
    const isKnown = known.some((b) => b.timestamp === timestamp);
    if (!isKnown) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(\.\d+)?$/.test(timestamp)) {
        return json(res, { ok: false, error: 'Invalid backup timestamp format' }, 400);
      }
      const dir = path.join(DATA_DIR, 'backups', timestamp);
      if (!fs.existsSync(dir)) {
        return json(res, { ok: false, error: 'Unknown backup timestamp' }, 400);
      }
    }
    const ok = restoreBackup(timestamp);
    if (ok) regenerateCONTEXTmd();
    return json(res, { ok });
  }

  // ---- SESSION LOG ----
  if (p === '/api/session-log' && req.method === 'GET') return json(res, getSessionLog());
  if (p === '/api/session-log' && req.method === 'POST') {
    const data = await body(req);
    if (!data || data._parseError || typeof data.type !== 'string') {
      return json(res, { ok: false, error: '"type" string is required' }, 400);
    }
    // Whitelist the fields we persist so callers cannot inject API keys, raw
    // request bodies, or other PII into the on-disk session log.
    const allowed = ['type', 'count', 'targets', 'outputDir', 'activeSkills', 'timestamp'];
    /** @type {Record<string, unknown>} */
    const entry = {};
    for (const key of allowed) if (data[key] !== undefined) entry[key] = data[key];
    appendSession(entry);
    return json(res, { ok: true });
  }

  // ---- MODES ----
  if (p === '/api/modes' && req.method === 'GET') return json(res, getModes());
  if (p === '/api/modes' && req.method === 'POST') {
    const data = await body(req);
    if (data && Array.isArray(data.modes)) {
      fs.writeFileSync(
        path.join(DATA_DIR, 'modes.json'),
        JSON.stringify({ modes: data.modes }, null, 2),
        'utf8',
      );
      return json(res, { ok: true });
    }
    return json(res, { ok: false, error: 'Invalid modes data' }, 400);
  }
  if (p === '/api/modes/apply' && req.method === 'POST') {
    const { modeId } = await body(req);
    const result = applyMode(modeId);
    return result
      ? json(res, { ok: true, states: result })
      : json(res, { ok: false, error: 'Mode not found' }, 404);
  }

  const handoffHandled = await handleHandoffRequest(req, res, url);
  if (handoffHandled !== null) return handoffHandled;

  // ---- API DOCS ----
  if (p === '/api/docs' && req.method === 'GET') {
    return json(res, apiDocs([...intelligenceRouteDocs(), ...handoffRouteDocs()]));
  }

  // ---- COMPILER ----
  if (p === '/api/compile/targets' && req.method === 'GET')
    return json(res, { targets: getAvailableTargets() });
  if (p === '/api/compile/preview' && req.method === 'POST') {
    const { targets } = await body(req);
    try {
      const result = compile({
        dataDir: DATA_DIR,
        skillsDir: SKILLS_DIR,
        scanSkills,
        targets: targets || undefined,
      });
      return json(res, result);
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }
  if (p === '/api/compile' && req.method === 'POST') {
    const { targets, outputDir } = await body(req);
    if (!outputDir) {
      return json(
        res,
        {
          ok: false,
          error:
            'outputDir is required. Use /api/compile/preview to inspect output without writing, /api/tools/install-global to write to home, or /api/workspaces/compile to write to a registered workspace.',
        },
        400,
      );
    }
    const denyReason = checkSafeWritePath(outputDir);
    if (denyReason) return json(res, { ok: false, error: denyReason }, 400);
    try {
      const result = compile({
        dataDir: DATA_DIR,
        skillsDir: SKILLS_DIR,
        scanSkills,
        targets: targets || undefined,
        outputDir,
      });
      appendSession({ type: 'compile', targets: targets || Object.keys(result.results), outputDir });
      return json(res, { ok: true, ...result });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // ---- TOOL DETECTION & GLOBAL INSTALL ----
  if (p === '/api/tools/detect' && req.method === 'GET') {
    return json(
      res,
      detectTools(HOMEDIR, {
        dataDir: DATA_DIR,
        skillsDir: SKILLS_DIR,
        scanSkills,
        adapters: ADAPTERS,
        buildContext,
        estimateTokens,
      }),
    );
  }
  if (p === '/api/tools/install-global' && req.method === 'POST') {
    const { targets } = await body(req);
    if (!targets || !Array.isArray(targets) || !targets.length) {
      return json(res, { ok: false, error: 'targets must be a non-empty array' }, 400);
    }
    const unknown = targets.filter((t) => !TOOL_REGISTRY[t]);
    if (unknown.length) return json(res, { ok: false, error: `Unknown targets: ${unknown.join(', ')}` }, 400);
    try {
      const result = compileToGlobal(
        { dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets },
        HOMEDIR,
      );
      appendSession({ type: 'global_install', targets, count: Object.keys(result.installed).length });
      return json(res, result);
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // ---- WORKSPACES ----
  if (p === '/api/workspaces' && req.method === 'GET') {
    try {
      return json(res, JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8')));
    } catch {
      return json(res, { version: '1.0', workspaces: [] });
    }
  }
  if (p === '/api/workspaces' && req.method === 'POST') {
    const { action, path: wsPath, label } = await body(req);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8'));
    } catch {
      data = {};
    }
    if (!Array.isArray(data.workspaces)) data.workspaces = [];

    if (action === 'add') {
      if (!wsPath) return json(res, { ok: false, error: 'path is required' }, 400);
      const resolved = path.resolve(wsPath);
      const denyReason = checkSafeWritePath(resolved);
      if (denyReason) return json(res, { ok: false, error: denyReason }, 400);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return json(res, { ok: false, error: 'Directory does not exist: ' + resolved }, 400);
      }
      if (data.workspaces.some((w) => path.normalize(w.path) === path.normalize(resolved))) {
        return json(res, { ok: false, error: 'Workspace already registered' }, 400);
      }
      data.workspaces.push({
        path: resolved,
        label: label || path.basename(resolved),
        added: new Date().toISOString().split('T')[0],
        lastCompiled: null,
      });
      fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
      return json(res, { ok: true, workspaces: data.workspaces });
    }
    if (action === 'remove') {
      if (!wsPath) return json(res, { ok: false, error: 'path is required' }, 400);
      const resolved = path.resolve(wsPath);
      data.workspaces = data.workspaces.filter((w) => path.normalize(w.path) !== path.normalize(resolved));
      fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
      return json(res, { ok: true, workspaces: data.workspaces });
    }
    return json(res, { ok: false, error: 'action must be add or remove' }, 400);
  }
  if (p === '/api/workspaces/compile' && req.method === 'POST') {
    const { targets, workspacePath } = await body(req);
    const selectedTargets =
      targets || Object.keys(TOOL_REGISTRY).filter((id) => TOOL_REGISTRY[id].supportsProject);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8'));
    } catch {
      data = {};
    }
    if (!Array.isArray(data.workspaces)) data.workspaces = [];

    const toCompile = workspacePath
      ? data.workspaces.filter((w) => path.normalize(w.path) === path.normalize(workspacePath))
      : data.workspaces;

    if (!toCompile.length) return json(res, { ok: false, error: 'No matching workspaces' }, 400);

    const results = {};
    const errors = [];
    for (const ws of toCompile) {
      // Re-check on every compile: a stored workspace could have been edited
      // outside the API surface to point at a sensitive directory.
      const denyReason = checkSafeWritePath(ws.path);
      if (denyReason) {
        errors.push(`${ws.path}: ${denyReason}`);
        continue;
      }
      try {
        const r = compile({
          dataDir: DATA_DIR,
          skillsDir: SKILLS_DIR,
          scanSkills,
          targets: selectedTargets,
          outputDir: ws.path,
        });
        results[ws.path] = { targets: Object.keys(r.results), errors: r.errors };
        ws.lastCompiled = new Date().toISOString().split('T')[0];
      } catch (e) {
        errors.push(`${ws.path}: ${e.message}`);
      }
    }
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
    appendSession({ type: 'workspace_compile', count: Object.keys(results).length });
    return json(res, { ok: true, results, errors, workspaces: data.workspaces });
  }

  // ---- PROJECTS ----
  if (p === '/api/projects' && req.method === 'GET') {
    return json(res, { ok: true, projects: listProjects() });
  }
  if (p === '/api/projects' && req.method === 'POST') {
    const input = await body(req);
    const result = createProject(input);
    return json(res, result, result.ok ? 200 : 400);
  }
  if (p.startsWith('/api/projects/') && req.method === 'PATCH') {
    let slug;
    try {
      slug = decodeURIComponent(p.slice('/api/projects/'.length));
    } catch {
      return json(res, { ok: false, error: 'Invalid path encoding' }, 400);
    }
    const patch = await body(req);
    const result = updateProject(slug, patch);
    return json(res, result, result.ok ? 200 : 404);
  }
  if (p.startsWith('/api/projects/') && req.method === 'DELETE') {
    let slug;
    try {
      slug = decodeURIComponent(p.slice('/api/projects/'.length));
    } catch {
      return json(res, { ok: false, error: 'Invalid path encoding' }, 400);
    }
    const result = deleteProject(slug);
    return json(res, result, result.ok ? 200 : 404);
  }
  if (p.startsWith('/api/projects/') && p.endsWith('/publish') && req.method === 'POST') {
    const slugRaw = p.slice('/api/projects/'.length);
    const slug = decodeURIComponent(slugRaw.slice(0, -'/publish'.length));
    const project = getProject(slug);
    if (!project) return json(res, { ok: false, error: 'Project not found' }, 404);
    if (!project.path) return json(res, { ok: false, error: 'Project has no folder path set' }, 400);
    const { ruleNames, targets } = await body(req);
    if (!Array.isArray(ruleNames) || !ruleNames.length) {
      return json(res, { ok: false, error: 'Select at least one rule' }, 400);
    }
    if (!Array.isArray(targets) || !targets.length) {
      return json(res, { ok: false, error: 'Select at least one target format' }, 400);
    }
    const denyReason = checkSafeWritePath(project.path);
    if (denyReason) return json(res, { ok: false, error: denyReason }, 400);
    const combined = combineRuleFiles(ruleNames);
    try {
      const result = compile({
        dataDir: DATA_DIR,
        skillsDir: SKILLS_DIR,
        scanSkills,
        targets,
        outputDir: project.path,
        rulesOverride: combined,
      });
      appendSession({ type: 'project_publish', slug, ruleNames, targets });
      return json(res, { ok: true, ...result });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  return null; // Not an API route
}

module.exports = { handleRequest };
