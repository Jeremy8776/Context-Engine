// server.js — Context Engine v3
// Dynamic Skill Discovery & Orchestrator Backend

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { compile, estimateTokens, getAvailableTargets, detectTools, compileToGlobal, TOOL_REGISTRY } = require('./compiler');

const PORT     = parseInt(process.env.CE_PORT, 10) || 3847;
const ROOT     = process.env.CE_ROOT || path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UI_DIR   = path.join(__dirname, '..', 'ui');  // UI always from repo
const CONTEXT_MD  = path.join(ROOT, 'CONTEXT.md');
const SKILLS_DIR  = path.join(ROOT, 'skills');
const HOMEDIR     = os.homedir();
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const SESSION_LOG = path.join(DATA_DIR, 'session-log.json');
const MODES_FILE  = path.join(DATA_DIR, 'modes.json');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css',   '.json': 'application/json',
};

const readData = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return null; } };
const writeData = (f, d) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2), 'utf8');

const ingestJobs = {};
function countSkillFiles(dir) {
  let count = 0;
  const walk = d => {
    try {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (f === 'SKILL.md') count++;
      }
    } catch {}
  };
  walk(dir);
  return count;
}

// ---- SKILL PARSE CACHE ----
const SKILL_CACHE_FILE = path.join(DATA_DIR, 'skill-parse-cache.json');
function loadParseCache() { try { return JSON.parse(fs.readFileSync(SKILL_CACHE_FILE, 'utf8')); } catch { return {}; } }
function saveParseCache(cache) { fs.writeFileSync(SKILL_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8'); }

async function llmParseSkill(skillPath) {
  const apiKey = getApiKey('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  const content = fs.readFileSync(skillPath, 'utf8').substring(0, 4000); // Cap input
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250414',
        max_tokens: 300,
        messages: [{ role: 'user', content: `Parse this SKILL.md and return ONLY a JSON object with these fields:
- "description": one-sentence summary of what this skill does (max 120 chars)
- "triggers": array of 3-5 short trigger phrases a user would say to invoke this skill

SKILL.md content:
${content}` }]
      })
    });
    const data = await resp.json();
    const text = data?.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) { console.error('LLM parse error:', e.message); }
  return null;
}

// ---- ENCRYPTED KEY STORE ----
const KEYS_FILE = path.join(DATA_DIR, '.keys.enc');

// Derive encryption key from machine-specific data (hostname + homedir + username)
function deriveKey() {
  const material = `${os.hostname()}:${os.homedir()}:${os.userInfo().username}:context-engine-v3`;
  return crypto.createHash('sha256').update(material).digest();
}

function encryptValue(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
}

function decryptValue(envelope) {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  return decipher.update(envelope.data, 'hex', 'utf8') + decipher.final('utf8');
}

function loadKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; } }
function saveKeys(keys) { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8'); }

function getApiKey(name) {
  // Env var takes precedence
  const envKey = process.env[name];
  if (envKey) return envKey;
  // Fall back to encrypted store
  const keys = loadKeys();
  if (keys[name]) { try { return decryptValue(keys[name]); } catch { return null; } }
  return null;
}

function setApiKey(name, value) {
  const keys = loadKeys();
  keys[name] = encryptValue(value);
  saveKeys(keys);
}

function removeApiKey(name) {
  const keys = loadKeys();
  delete keys[name];
  saveKeys(keys);
}

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

function parseSkillFrontmatter(content) {
  const fm = {};
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return fm;
  const block = fmMatch[1].replace(/\r\n/g, '\n');
  // Parse YAML-like key: value (handles quoted and unquoted values)
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w[\w_-]*):\s*(.+)/);
    if (m) {
      let val = m[2].trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[m[1]] = val;
    }
  }
  return fm;
}

function extractTriggers(content, desc) {
  const triggers = [];

  // Check for explicit ## Triggers section
  const trigSection = content.match(/## Triggers\n([\s\S]*?)(?:\n##|$)/);
  if (trigSection) {
    trigSection[1].trim().split('\n').forEach(line => {
      const t = line.replace(/^-\s*/, '').trim();
      if (t) triggers.push(t);
    });
  }

  // Extract trigger phrases from description ("open X", "launch Y", slash commands)
  const slashCmds = (desc || '').match(/\/[a-z][\w-]+/g);
  if (slashCmds) slashCmds.forEach(c => { if (!triggers.includes(c)) triggers.push(c); });

  // Extract quoted trigger phrases like "open Photoshop", "launch ComfyUI"
  const quoted = (desc || '').match(/"([^"]{3,40})"/g);
  if (quoted) {
    quoted.forEach(q => {
      const phrase = q.replace(/"/g, '');
      // Only keep short action-like phrases
      if (phrase.split(' ').length <= 5 && /^[a-z]/i.test(phrase)) {
        if (!triggers.includes(phrase)) triggers.push(phrase);
      }
    });
  }

  return triggers.slice(0, 10); // Cap at 10
}

function scanSkills() {
  const map = {};
  if (!fs.existsSync(SKILLS_DIR)) return map;
  const cache = loadParseCache();

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
          const fm = parseSkillFrontmatter(content);
          const cached = cache[id];

          // Description: cache > frontmatter > first paragraph after heading > fallback
          let desc = cached?.description || fm.description || '';
          if (!desc) {
            const headingMatch = content.match(/^#\s+.+\r?\n\r?\n(.+)/m);
            if (headingMatch) desc = headingMatch[1].trim();
          }

          const triggers = cached?.triggers || extractTriggers(content, desc);

          map[id] = {
            id,
            name: fm.name || id,
            cat,
            type: dir.includes('builtin') ? 'builtin' : 'custom',
            path: skillFile,
            desc: desc || 'No description',
            triggers,
            needsParse: !fm.description && !cached
          };
        } else {
          scan(fullPath, item);
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

  // ---- LLM Parse unparsed skills ----
  if (p === '/api/skills/parse' && req.method === 'POST') {
    if (!getApiKey('ANTHROPIC_API_KEY')) return json(res, { ok: false, error: 'No API key configured. Add one in Soul & Rules > API Keys.' }, 400);
    const skills = Object.values(scanSkills()).filter(s => s.needsParse);
    if (!skills.length) return json(res, { ok: true, parsed: 0, message: 'All skills already parsed' });

    const cache = loadParseCache();
    let parsed = 0;
    for (const skill of skills) {
      const result = await llmParseSkill(skill.path);
      if (result) {
        cache[skill.id] = {
          description: result.description || '',
          triggers: Array.isArray(result.triggers) ? result.triggers : [],
          parsedAt: Date.now()
        };
        parsed++;
      }
    }
    saveParseCache(cache);
    return json(res, { ok: true, parsed, total: skills.length });
  }

  // ---- Skill Ingest (GitHub clone) ----
  if (p === '/api/skills/ingest' && req.method === 'POST') {
    const data = await body(req);
    let repoUrl = data?.url;
    if (!repoUrl || !repoUrl.startsWith('http')) return json(res, { ok: false, error: 'Invalid URL' }, 400);

    // Normalize URL — strip /tree/main/..., trailing slashes, .git
    repoUrl = repoUrl.replace(/\/tree\/[^/]+.*$/, '').replace(/\.git$/, '').replace(/\/+$/, '');

    // Extract owner/repo for the slug
    const urlParts = repoUrl.replace(/^https?:\/\/github\.com\//, '').split('/');
    if (urlParts.length < 2) return json(res, { ok: false, error: 'Invalid GitHub URL — need owner/repo' }, 400);
    const slug = `${urlParts[0]}-${urlParts[1]}`.toLowerCase();

    const jobId = 'ingest_' + Date.now();
    const destDir = path.join(SKILLS_DIR, 'ingested', slug);

    ingestJobs[jobId] = { status: 'running', log: [], count: 0 };
    const job = ingestJobs[jobId];

    // Run git clone in background
    const { exec } = require('child_process');
    job.log.push(`Cloning ${repoUrl}...`);

    if (fs.existsSync(destDir)) {
      job.log.push(`Directory exists, pulling latest...`);
      exec(`git -C "${destDir}" pull`, (err, stdout, stderr) => {
        if (err) { job.log.push(`Error: ${err.message}`); job.status = 'error'; return; }
        job.log.push(stdout.trim() || 'Up to date.');
        // Count SKILL.md files
        const count = countSkillFiles(destDir);
        job.count = count;
        job.log.push(`Found: ${count} skill(s)`);
        job.log.push('Done');
        job.status = 'done';
      });
    } else {
      exec(`git clone --depth 1 "${repoUrl}" "${destDir}"`, (err, stdout, stderr) => {
        if (err) { job.log.push(`Error: ${err.message}`); job.status = 'error'; return; }
        job.log.push('Clone complete.');
        const count = countSkillFiles(destDir);
        job.count = count;
        job.log.push(`Found: ${count} skill(s)`);
        job.log.push('Done');
        job.status = 'done';
      });
    }

    return json(res, { ok: true, jobId });
  }

  // Poll ingest job status
  if (p.startsWith('/api/skills/ingest/') && req.method === 'GET') {
    const jobId = p.split('/').pop();
    const job = ingestJobs[jobId];
    if (!job) return json(res, { ok: false, error: 'Job not found' }, 404);
    return json(res, { ok: true, status: job.status, log: job.log, count: job.count });
  }

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
  // ---- API Keys (encrypted at rest) ----
  if (p === '/api/keys/status' && req.method === 'GET') {
    const hasKey = !!getApiKey('ANTHROPIC_API_KEY');
    return json(res, { ANTHROPIC_API_KEY: hasKey });
  }
  if (p === '/api/keys' && req.method === 'POST') {
    const data = await body(req);
    if (!data?.name || !data?.value) return json(res, { ok: false, error: 'Missing name or value' }, 400);
    // Only allow known key names
    const allowed = ['ANTHROPIC_API_KEY'];
    if (!allowed.includes(data.name)) return json(res, { ok: false, error: 'Unknown key name' }, 400);
    // Basic validation
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
  if (p === '/api/modes'       && req.method === 'POST') {
    const data = await body(req);
    if (data && Array.isArray(data.modes)) {
      fs.writeFileSync(MODES_FILE, JSON.stringify({ modes: data.modes }, null, 2), 'utf8');
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
        { method: 'GET',  path: '/api/tools/detect',       description: 'Auto-detect installed AI tools' },
        { method: 'POST', path: '/api/tools/install-global',description: 'Install compiled context to global tool paths' },
        { method: 'GET',  path: '/api/workspaces',          description: 'List registered project workspaces' },
        { method: 'POST', path: '/api/workspaces',          description: 'Add or remove a workspace' },
        { method: 'POST', path: '/api/workspaces/compile',  description: 'Compile into one or all workspaces' },
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

  // ---- TOOL DETECTION & GLOBAL INSTALL ----
  if (p === '/api/tools/detect' && req.method === 'GET') {
    return json(res, detectTools(HOMEDIR));
  }
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
    try {
      const data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8'));
      return json(res, data);
    } catch {
      return json(res, { version: '1.0', workspaces: [] });
    }
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
      if (data.workspaces.some(w => path.resolve(w.path) === resolved)) {
        return json(res, { ok: false, error: 'Workspace already registered' }, 400);
      }
      data.workspaces.push({ path: resolved, label: label || path.basename(resolved), added: new Date().toISOString().split('T')[0], lastCompiled: null });
      fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2), 'utf8');
      return json(res, { ok: true, workspaces: data.workspaces });
    }
    if (action === 'remove') {
      if (!wsPath) return json(res, { ok: false, error: 'path is required' }, 400);
      const resolved = path.resolve(wsPath);
      data.workspaces = data.workspaces.filter(w => path.resolve(w.path) !== resolved);
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
      ? data.workspaces.filter(w => path.resolve(w.path) === path.resolve(workspacePath))
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
