// router.js — API route handlers for Context Engine v3

const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { DATA_DIR, SKILLS_DIR, CONTEXT_MD, HOMEDIR, WORKSPACES_FILE } = require('./lib/config');
const { body, json } = require('./lib/http');
const { getApiKey, setApiKey, removeApiKey } = require('./lib/crypto');
const { validateMemory, validateRules, validateStates } = require('./lib/validation');
const { scanSkills, invalidateSkillCache, skillHealthCheck, countSkillFiles, llmParseSkill, loadParseCache, saveParseCache } = require('./lib/skills');
const { readData, writeData, createBackup, listBackups, restoreBackup, getSessionLog, appendSession } = require('./lib/backup');
const { getModes, regenerateCONTEXTmd, applyMode, estimateContextBudget } = require('./lib/modes');
const { compile, getAvailableTargets, detectTools, compileToGlobal, TOOL_REGISTRY } = require('./compiler');

const ingestJobs = {};

async function handleRequest(req, res, url) {
  const p = url.pathname;

  // ---- SKILLS ----
  if (p === '/api/skills' && req.method === 'GET') return json(res, Object.values(scanSkills()));

  if (p === '/api/skills/parse' && req.method === 'POST') {
    if (!getApiKey('ANTHROPIC_API_KEY')) return json(res, { ok: false, error: 'No API key configured. Add one in Soul & Rules > API Keys.' }, 400);
    const skills = Object.values(scanSkills()).filter(s => s.needsParse);
    if (!skills.length) return json(res, { ok: true, parsed: 0, message: 'All skills already parsed' });
    const cache = loadParseCache();
    let parsed = 0;
    for (const skill of skills) {
      const result = await llmParseSkill(skill.path);
      if (result) {
        cache[skill.id] = { description: result.description || '', triggers: Array.isArray(result.triggers) ? result.triggers : [], parsedAt: Date.now() };
        parsed++;
      }
    }
    saveParseCache(cache);
    invalidateSkillCache();
    return json(res, { ok: true, parsed, total: skills.length });
  }

  // ---- SKILL INGEST (GitHub clone) ----
  if (p === '/api/skills/ingest' && req.method === 'POST') {
    const data = await body(req);
    let repoUrl = data?.url;
    if (!repoUrl || !repoUrl.startsWith('http')) return json(res, { ok: false, error: 'Invalid URL' }, 400);
    repoUrl = repoUrl.replace(/\/tree\/[^/]+.*$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
    const urlParts = repoUrl.replace(/^https?:\/\/github\.com\//, '').split('/');
    if (urlParts.length < 2) return json(res, { ok: false, error: 'Invalid GitHub URL — need owner/repo' }, 400);
    const slug = `${urlParts[0]}-${urlParts[1]}`.toLowerCase();
    const jobId = 'ingest_' + Date.now();
    const destDir = path.join(SKILLS_DIR, 'ingested', slug);
    ingestJobs[jobId] = { status: 'running', log: [], count: 0 };
    const job = ingestJobs[jobId];
    job.log.push(`Cloning ${repoUrl}...`);

    if (fs.existsSync(destDir)) {
      job.log.push('Directory exists, pulling latest...');
      exec(`git -C "${destDir}" pull`, (err, stdout) => {
        if (err) { job.log.push(`Error: ${err.message}`); job.status = 'error'; return; }
        job.log.push(stdout.trim() || 'Up to date.');
        job.count = countSkillFiles(destDir);
        job.log.push(`Found: ${job.count} skill(s)`);
        job.log.push('Done');
        job.status = 'done';
        invalidateSkillCache();
      });
    } else {
      exec(`git clone --depth 1 "${repoUrl}" "${destDir}"`, (err) => {
        if (err) { job.log.push(`Error: ${err.message}`); job.status = 'error'; return; }
        job.log.push('Clone complete.');
        job.count = countSkillFiles(destDir);
        job.log.push(`Found: ${job.count} skill(s)`);
        job.log.push('Done');
        job.status = 'done';
        invalidateSkillCache();
      });
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

  // ---- API KEYS ----
  if (p === '/api/keys/status' && req.method === 'GET') {
    return json(res, { ANTHROPIC_API_KEY: !!getApiKey('ANTHROPIC_API_KEY') });
  }
  if (p === '/api/keys' && req.method === 'POST') {
    const data = await body(req);
    if (!data?.name || !data?.value) return json(res, { ok: false, error: 'Missing name or value' }, 400);
    const allowed = ['ANTHROPIC_API_KEY'];
    if (!allowed.includes(data.name)) return json(res, { ok: false, error: 'Unknown key name' }, 400);
    if (data.name === 'ANTHROPIC_API_KEY' && !data.value.startsWith('sk-ant-')) {
      return json(res, { ok: false, error: 'Invalid key format — should start with sk-ant-' }, 400);
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
  if (p === '/api/states' && req.method === 'GET') return json(res, readData('skill-states.json'));
  if (p === '/api/states' && req.method === 'POST') {
    const data = await body(req);
    const v = validateStates(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    const backup = readData('skill-states.json');
    try {
      writeData('skill-states.json', data);
      const regen = regenerateCONTEXTmd();
      appendSession({ type: 'toggle', activeSkills: regen.activeCount });
      return json(res, { ok: true, ...regen });
    } catch (e) {
      if (backup) writeData('skill-states.json', backup);
      return json(res, { ok: false, error: 'State update failed: ' + e.message }, 500);
    }
  }

  // ---- CONTEXT.MD ----
  if (p === '/api/context-md' && req.method === 'GET') {
    try { return json(res, { content: fs.readFileSync(CONTEXT_MD, 'utf8'), ...estimateContextBudget() }); }
    catch { return json(res, { content: '', error: 'File not found' }); }
  }
  if (p === '/api/context-md' && req.method === 'POST') {
    const r = regenerateCONTEXTmd();
    appendSession({ type: 'manual_regen', ...r });
    return json(res, { ok: true, ...r });
  }

  // ---- HEALTH ----
  if (p === '/api/health' && req.method === 'GET') return json(res, { skills: skillHealthCheck(), budget: estimateContextBudget() });

  // ---- BACKUPS ----
  if (p === '/api/backups' && req.method === 'GET') return json(res, { backups: listBackups() });
  if (p === '/api/backups' && req.method === 'POST') {
    const b = createBackup();
    appendSession({ type: 'backup', timestamp: b.timestamp });
    return json(res, { ok: true, ...b });
  }
  if (p === '/api/restore' && req.method === 'POST') {
    const { timestamp } = await body(req);
    const ok = restoreBackup(timestamp);
    if (ok) regenerateCONTEXTmd();
    return json(res, { ok });
  }

  // ---- SESSION LOG ----
  if (p === '/api/session-log' && req.method === 'GET') return json(res, getSessionLog());
  if (p === '/api/session-log' && req.method === 'POST') { appendSession(await body(req)); return json(res, { ok: true }); }

  // ---- MODES ----
  if (p === '/api/modes' && req.method === 'GET') return json(res, getModes());
  if (p === '/api/modes' && req.method === 'POST') {
    const data = await body(req);
    if (data && Array.isArray(data.modes)) {
      fs.writeFileSync(path.join(DATA_DIR, 'modes.json'), JSON.stringify({ modes: data.modes }, null, 2), 'utf8');
      return json(res, { ok: true });
    }
    return json(res, { ok: false, error: 'Invalid modes data' }, 400);
  }
  if (p === '/api/modes/apply' && req.method === 'POST') {
    const { modeId } = await body(req);
    const result = applyMode(modeId);
    return result ? json(res, { ok: true, states: result }) : json(res, { ok: false, error: 'Mode not found' }, 404);
  }

  // ---- API DOCS ----
  if (p === '/api/docs' && req.method === 'GET') {
    return json(res, {
      version: '0.2.0',
      endpoints: [
        { method: 'GET',  path: '/api/skills',            description: 'List all discovered skills' },
        { method: 'GET',  path: '/api/memory',             description: 'Get memory entries' },
        { method: 'POST', path: '/api/memory',             description: 'Update memory (validated)' },
        { method: 'GET',  path: '/api/rules',              description: 'Get rules configuration' },
        { method: 'POST', path: '/api/rules',              description: 'Update rules (validated)' },
        { method: 'GET',  path: '/api/states',             description: 'Get skill toggle states' },
        { method: 'POST', path: '/api/states',             description: 'Update states + regenerate (transactional)' },
        { method: 'GET',  path: '/api/context-md',         description: 'Get CONTEXT.md content + budget' },
        { method: 'POST', path: '/api/context-md',         description: 'Force-regenerate CONTEXT.md' },
        { method: 'GET',  path: '/api/compile/targets',    description: 'List available compile targets' },
        { method: 'POST', path: '/api/compile/preview',    description: 'Preview compiled output' },
        { method: 'POST', path: '/api/compile',            description: 'Compile and write files to disk' },
        { method: 'GET',  path: '/api/health',             description: 'Skill health check + budget' },
        { method: 'GET',  path: '/api/backups',            description: 'List backup snapshots' },
        { method: 'POST', path: '/api/backups',            description: 'Create backup snapshot' },
        { method: 'POST', path: '/api/restore',            description: 'Restore from backup' },
        { method: 'GET',  path: '/api/session-log',        description: 'Get activity log' },
        { method: 'GET',  path: '/api/modes',              description: 'List mode presets' },
        { method: 'POST', path: '/api/modes/apply',        description: 'Apply mode preset (transactional)' },
        { method: 'GET',  path: '/api/tools/detect',       description: 'Auto-detect installed AI tools' },
        { method: 'POST', path: '/api/tools/install-global', description: 'Install compiled context to global tool paths' },
        { method: 'GET',  path: '/api/workspaces',         description: 'List registered project workspaces' },
        { method: 'POST', path: '/api/workspaces',         description: 'Add or remove a workspace' },
        { method: 'POST', path: '/api/workspaces/compile', description: 'Compile into one or all workspaces' },
      ]
    });
  }

  // ---- COMPILER ----
  if (p === '/api/compile/targets' && req.method === 'GET') return json(res, { targets: getAvailableTargets() });
  if (p === '/api/compile/preview' && req.method === 'POST') {
    const { targets } = await body(req);
    try {
      const result = compile({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets: targets || undefined });
      return json(res, result);
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }
  if (p === '/api/compile' && req.method === 'POST') {
    const { targets, outputDir } = await body(req);
    const outDir = outputDir || path.join(DATA_DIR, '..');
    try {
      const result = compile({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets: targets || undefined, outputDir: outDir });
      appendSession({ type: 'compile', targets: targets || Object.keys(result.results), outputDir: outDir });
      return json(res, { ok: true, ...result });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // ---- TOOL DETECTION & GLOBAL INSTALL ----
  if (p === '/api/tools/detect' && req.method === 'GET') return json(res, detectTools(HOMEDIR));
  if (p === '/api/tools/install-global' && req.method === 'POST') {
    const { targets } = await body(req);
    if (!targets || !Array.isArray(targets) || !targets.length) {
      return json(res, { ok: false, error: 'targets must be a non-empty array' }, 400);
    }
    try {
      const result = compileToGlobal({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets }, HOMEDIR);
      appendSession({ type: 'global_install', targets, count: Object.keys(result.installed).length });
      return json(res, result);
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // ---- WORKSPACES ----
  if (p === '/api/workspaces' && req.method === 'GET') {
    try { return json(res, JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8'))); }
    catch { return json(res, { version: '1.0', workspaces: [] }); }
  }
  if (p === '/api/workspaces' && req.method === 'POST') {
    const { action, path: wsPath, label } = await body(req);
    let data;
    try { data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8')); } catch { data = {}; }
    if (!Array.isArray(data.workspaces)) data.workspaces = [];

    if (action === 'add') {
      if (!wsPath) return json(res, { ok: false, error: 'path is required' }, 400);
      const resolved = path.resolve(wsPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return json(res, { ok: false, error: 'Directory does not exist: ' + resolved }, 400);
      }
      if (data.workspaces.some(w => path.normalize(w.path) === path.normalize(resolved))) {
        return json(res, { ok: false, error: 'Workspace already registered' }, 400);
      }
      data.workspaces.push({ path: resolved, label: label || path.basename(resolved), added: new Date().toISOString().split('T')[0], lastCompiled: null });
      fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
      return json(res, { ok: true, workspaces: data.workspaces });
    }
    if (action === 'remove') {
      if (!wsPath) return json(res, { ok: false, error: 'path is required' }, 400);
      const resolved = path.resolve(wsPath);
      data.workspaces = data.workspaces.filter(w => path.normalize(w.path) !== path.normalize(resolved));
      fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
      return json(res, { ok: true, workspaces: data.workspaces });
    }
    return json(res, { ok: false, error: 'action must be add or remove' }, 400);
  }
  if (p === '/api/workspaces/compile' && req.method === 'POST') {
    const { targets, workspacePath } = await body(req);
    const selectedTargets = targets || Object.keys(TOOL_REGISTRY).filter(id => TOOL_REGISTRY[id].supportsProject);
    let data;
    try { data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8')); } catch { data = {}; }
    if (!Array.isArray(data.workspaces)) data.workspaces = [];

    const toCompile = workspacePath
      ? data.workspaces.filter(w => path.normalize(w.path) === path.normalize(workspacePath))
      : data.workspaces;

    if (!toCompile.length) return json(res, { ok: false, error: 'No matching workspaces' }, 400);

    const results = {};
    const errors = [];
    for (const ws of toCompile) {
      try {
        const r = compile({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets: selectedTargets, outputDir: ws.path });
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

  return null; // Not an API route
}

module.exports = { handleRequest };
