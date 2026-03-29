// server.js — Context Engine v3
// Dynamic Skill Discovery & Orchestrator Backend

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { compile, estimateTokens, getAvailableTargets } = require('./compiler');

const PORT     = 3847;
const ROOT     = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UI_DIR   = path.join(ROOT, 'ui');
const CONTEXT_MD  = path.join(ROOT, 'CONTEXT.md');
const SKILLS_DIR  = path.join(ROOT, 'skills');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SESSION_LOG = path.join(DATA_DIR, 'session-log.json');
const MODES_FILE  = path.join(DATA_DIR, 'modes.json');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css',   '.json': 'application/json',
};

const readData = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return null; } };
const writeData = (f, d) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2), 'utf8');

// ---- VALIDATION ----
function validateMemory(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  if (!Array.isArray(data.entries)) return { valid: false, error: 'Missing or invalid "entries" array' };
  for (let i = 0; i < data.entries.length; i++) {
    const e = data.entries[i];
    if (!e || typeof e !== 'object') return { valid: false, error: `Entry ${i}: must be an object` };
    if (typeof e.content !== 'string' || !e.content.trim()) return { valid: false, error: `Entry ${i}: missing "content" string` };
  }
  return { valid: true, error: null };
}
function validateRules(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  for (const key of ['coding', 'general', 'soul']) {
    if (typeof data[key] !== 'string') return { valid: false, error: `Missing or invalid "${key}" string` };
  }
  return { valid: true, error: null };
}
function validateStates(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Must be a JSON object' };
  if (data._parseError) return { valid: false, error: 'Invalid JSON in request body' };
  const states = data.states || data;
  if (typeof states !== 'object' || Array.isArray(states)) return { valid: false, error: '"states" must be an object' };
  for (const [k, v] of Object.entries(states)) {
    if (typeof v !== 'boolean') return { valid: false, error: `State "${k}" must be boolean, got ${typeof v}` };
  }
  return { valid: true, error: null };
}

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['http://localhost:3847', 'http://127.0.0.1:3847'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
const MAX_BODY = 1024 * 1024; // 1 MB
function body(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => {
      d += c;
      if (d.length > MAX_BODY) { req.destroy(); reject(new Error('Payload too large')); }
    });
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ _parseError: true }); } });
  });
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function scanSkills() {
  const map = {};
  if (!fs.existsSync(SKILLS_DIR)) return map;
  
  const scan = (dir, cat = 'Uncategorized') => {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const id = item;
          const content = fs.readFileSync(skillFile, 'utf8');
          const descriptionMatch = content.match(/# (.*?)\n(.*?)\n/);
          const triggersMatch = content.match(/## Triggers\n([\s\S]*?)\n##/);
          
          map[id] = {
            id,
            cat,
            type: dir.includes('builtin') ? 'builtin' : 'custom',
            path: skillFile,
            desc: descriptionMatch ? descriptionMatch[2].trim() : 'No description',
            triggers: triggersMatch ? triggersMatch[1].trim().split('\n').map(t => t.replace(/^-\s*/, '').trim()) : []
          };
        } else {
          scan(fullPath, item); // Recursive for nested categories
        }
      }
    });
  };
  
  scan(SKILLS_DIR);
  return map;
}

function regenerateCONTEXTmd() {
  const SKILL_MAP = scanSkills();
  const states = readData('skill-states.json') || {};
  const stateMap = states.states || states;
  const activeSkills = Object.entries(SKILL_MAP).filter(([id]) => stateMap[id] !== false);
  const skillTable = activeSkills.map(([,s]) => {
    const relPath = path.relative(ROOT, s.path).replace(/\\/g, '/');
    return `| ${s.cat.padEnd(28)} | ${relPath} |`;
  }).join('\n');
  const activeCount = activeSkills.length;
  const total = Object.keys(SKILL_MAP).length;
  const now = new Date().toISOString().split('T')[0];
  const content = `# System Context
> Auto-loaded by AI Agent. Last updated: ${now}.
> Active skills: ${activeCount}/${total}. Regenerated by Context Engine.

---

## Data Files (read at session start)
| File | Purpose |
|------|---------|
| data/memory.json | Built memory |
| data/rules.json | Operational rules |
| data/skill-states.json| Which skills are active/inactive |

---

## Active Skills (${activeCount}/${total})
Before any task, check if a matching skill is active, then read its SKILL.md.

| Task type                     | Skill file |
|-------------------------------|------------|
${skillTable}
`;
  fs.writeFileSync(CONTEXT_MD, content, 'utf8');
  return { activeCount, total };
}

function skillHealthCheck() {
  const SKILL_MAP = scanSkills();
  return Object.entries(SKILL_MAP).map(([id, s]) => {
    const exists = fs.existsSync(s.path);
    if (!exists) return { id, path: s.path, exists, issue: 'SKILL.md not found', stale: false, daysSinceModified: null };
    try {
      const stat = fs.statSync(s.path);
      const daysSinceModified = Math.floor((Date.now() - stat.mtimeMs) / 86400000);
      return { id, path: s.path, exists, issue: null, stale: daysSinceModified > 30, daysSinceModified, lastModified: stat.mtimeMs };
    } catch {
      return { id, path: s.path, exists, issue: null, stale: false, daysSinceModified: null };
    }
  });
}

function createBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(BACKUPS_DIR, ts);
  fs.mkdirSync(dir, { recursive: true });
  ['memory.json', 'rules.json', 'skill-states.json'].forEach(f => {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  });
  if (fs.existsSync(CONTEXT_MD)) fs.copyFileSync(CONTEXT_MD, path.join(dir, 'CONTEXT.md'));
  return { timestamp: ts };
}
function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR)
    .filter(d => fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort().reverse().slice(0, 20).map(ts => ({ timestamp: ts }));
}
function restoreBackup(ts) {
  const dir = path.join(BACKUPS_DIR, ts);
  if (!fs.existsSync(dir)) return false;
  ['memory.json', 'rules.json', 'skill-states.json'].forEach(f => {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA_DIR, f));
  });
  const cm = path.join(dir, 'CONTEXT.md');
  if (fs.existsSync(cm)) fs.copyFileSync(cm, CONTEXT_MD);
  return true;
}

function getSessionLog() {
  try { return JSON.parse(fs.readFileSync(SESSION_LOG, 'utf8')); }
  catch { return { sessions: [] }; }
}
function appendSession(entry) {
  const log = getSessionLog();
  log.sessions.unshift({ ...entry, ts: new Date().toISOString() });
  log.sessions = log.sessions.slice(0, 50);
  fs.writeFileSync(SESSION_LOG, JSON.stringify(log, null, 2), 'utf8');
}

function estimateContextBudget() {
  try {
    const contextMd  = fs.existsSync(CONTEXT_MD) ? fs.readFileSync(CONTEXT_MD, 'utf8') : '';
    const memText   = JSON.stringify(readData('memory.json') || '');
    const rulesText = JSON.stringify(readData('rules.json') || '');
    const totalChars = contextMd.length + memText.length + rulesText.length;
    const contextTokens = estimateTokens(contextMd);
    const memoryTokens  = estimateTokens(memText);
    const rulesTokens   = estimateTokens(rulesText);
    const totalTokens   = contextTokens + memoryTokens + rulesTokens;
    return {
      contextMdChars: contextMd.length, memoryChars: memText.length,
      rulesChars: rulesText.length, totalChars,
      estimatedTokens: totalTokens, budgetPercent: Math.round((totalTokens / 200000) * 100),
      contextMdLines: contextMd.split('\n').length,
      breakdown: {
        context: { chars: contextMd.length, tokens: contextTokens },
        memory:  { chars: memText.length, tokens: memoryTokens },
        rules:   { chars: rulesText.length, tokens: rulesTokens },
      }
    };
  } catch(e) { return { error: e.message }; }
}

// ---- Modes — icon is now a string key, rendered as SVG in the UI ----
const DEFAULT_MODES = {
  modes: [
    {
      id: 'all', label: 'All On', icon: 'unlock',
      desc: 'Activate all discovered skills for maximum capability.',
      skills: [] // Populated dynamically or by ID
    },
    {
      id: 'coding', label: 'Heavy Coding', icon: 'code',
      desc: 'Optimized for complex refactoring and library development.',
      skills: ['example-skill']
    },
    {
      id: 'minimal', label: 'Lean Mode', icon: 'shield',
      desc: 'Minimal context for faster inference and lower token usage.',
      skills: []
    }
  ]
};

function getModes() {
  try { return JSON.parse(fs.readFileSync(MODES_FILE, 'utf8')); }
  catch { return DEFAULT_MODES; }
}

function applyMode(modeId) {
  const SKILL_MAP = scanSkills();
  const modesData = getModes();
  const mode = modesData.modes.find(m => m.id === modeId);
  if (!mode) return null;
  const backup = readData('skill-states.json');
  const states = backup || {};
  const stateMap = { ...(states.states || {}) };

  Object.keys(SKILL_MAP).forEach(id => { stateMap[id] = false; });

  if (mode.id === 'all') {
    Object.keys(SKILL_MAP).forEach(id => { stateMap[id] = true; });
  } else {
    mode.skills.forEach(id => { if(SKILL_MAP[id]) stateMap[id] = true; });
  }

  const newStates = { version: '1.0', last_updated: new Date().toISOString().split('T')[0], states: stateMap };
  try {
    writeData('skill-states.json', newStates);
    regenerateCONTEXTmd();
    appendSession({ type: 'mode_applied', mode: modeId, skills: Object.keys(stateMap).filter(k => stateMap[k]) });
    return newStates;
  } catch (e) {
    if (backup) writeData('skill-states.json', backup);
    throw e;
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/api/skills'  && req.method === 'GET')  return json(res, Object.values(scanSkills()));
  if (p === '/api/memory'  && req.method === 'GET')  return json(res, readData('memory.json'));
  if (p === '/api/memory'  && req.method === 'POST')  {
    const data = await body(req);
    const v = validateMemory(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    writeData('memory.json', data);
    return json(res, { ok: true });
  }
  if (p === '/api/rules'   && req.method === 'GET')   return json(res, readData('rules.json'));
  if (p === '/api/rules'   && req.method === 'POST')  {
    const data = await body(req);
    const v = validateRules(data);
    if (!v.valid) return json(res, { ok: false, error: v.error }, 400);
    writeData('rules.json', data);
    return json(res, { ok: true });
  }
  if (p === '/api/states'  && req.method === 'GET')   return json(res, readData('skill-states.json'));
  if (p === '/api/states'  && req.method === 'POST')  {
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
  if (p === '/api/context-md' && req.method === 'GET') {
    try { return json(res, { content: fs.readFileSync(CONTEXT_MD, 'utf8'), ...estimateContextBudget() }); }
    catch { return json(res, { content: '', error: 'File not found' }); }
  }
  if (p === '/api/context-md' && req.method === 'POST') {
    const r = regenerateCONTEXTmd();
    appendSession({ type: 'manual_regen', ...r });
    return json(res, { ok: true, ...r });
  }
  if (p === '/api/health'   && req.method === 'GET') return json(res, { skills: skillHealthCheck(), budget: estimateContextBudget() });
  if (p === '/api/backups'  && req.method === 'GET') return json(res, { backups: listBackups() });
  if (p === '/api/backups'  && req.method === 'POST') {
    const b = createBackup();
    appendSession({ type: 'backup', timestamp: b.timestamp });
    return json(res, { ok: true, ...b });
  }
  if (p === '/api/restore'  && req.method === 'POST') {
    const { timestamp } = await body(req);
    const ok = restoreBackup(timestamp);
    if (ok) regenerateCONTEXTmd();
    return json(res, { ok });
  }
  if (p === '/api/session-log' && req.method === 'GET')  return json(res, getSessionLog());
  if (p === '/api/session-log' && req.method === 'POST') { appendSession(await body(req)); return json(res, {ok:true}); }
  if (p === '/api/modes'       && req.method === 'GET')  return json(res, getModes());
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
        { method: 'GET',  path: '/api/skills',          description: 'List all discovered skills' },
        { method: 'GET',  path: '/api/memory',           description: 'Get memory entries' },
        { method: 'POST', path: '/api/memory',           description: 'Update memory (validated)' },
        { method: 'GET',  path: '/api/rules',            description: 'Get rules configuration' },
        { method: 'POST', path: '/api/rules',            description: 'Update rules (validated)' },
        { method: 'GET',  path: '/api/states',           description: 'Get skill toggle states' },
        { method: 'POST', path: '/api/states',           description: 'Update states + regenerate (transactional)' },
        { method: 'GET',  path: '/api/context-md',       description: 'Get CONTEXT.md content + budget' },
        { method: 'POST', path: '/api/context-md',       description: 'Force-regenerate CONTEXT.md' },
        { method: 'GET',  path: '/api/compile/targets',  description: 'List available compile targets' },
        { method: 'POST', path: '/api/compile/preview',  description: 'Preview compiled output' },
        { method: 'POST', path: '/api/compile',          description: 'Compile and write files to disk' },
        { method: 'GET',  path: '/api/health',           description: 'Skill health check + budget' },
        { method: 'GET',  path: '/api/backups',          description: 'List backup snapshots' },
        { method: 'POST', path: '/api/backups',          description: 'Create backup snapshot' },
        { method: 'POST', path: '/api/restore',          description: 'Restore from backup' },
        { method: 'GET',  path: '/api/session-log',      description: 'Get activity log' },
        { method: 'GET',  path: '/api/modes',            description: 'List mode presets' },
        { method: 'POST', path: '/api/modes/apply',      description: 'Apply mode preset (transactional)' },
      ]
    });
  }

  // ---- COMPILER ENDPOINTS ----
  if (p === '/api/compile/targets' && req.method === 'GET') {
    return json(res, { targets: getAvailableTargets() });
  }
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
    const outDir = outputDir || ROOT;
    try {
      const result = compile({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills, targets: targets || undefined, outputDir: outDir });
      appendSession({ type: 'compile', targets: targets || Object.keys(result.results), outputDir: outDir });
      return json(res, { ok: true, ...result });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // Path traversal protection: resolve and verify the path stays inside UI_DIR
  const safePath = path.resolve(UI_DIR, '.' + (p === '/' ? '/index.html' : p));
  if (!safePath.startsWith(path.resolve(UI_DIR))) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(safePath)) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safePath)] || 'text/plain' });
    return res.end(fs.readFileSync(safePath));
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Context Engine v3 — http://localhost:${PORT}`);
  try {
    const r = regenerateCONTEXTmd();
    console.log(`CONTEXT.md regenerated — ${r.activeCount}/${r.total} skills active`);
  } catch(e) { console.error('CONTEXT.md regen failed:', e.message); }
});
