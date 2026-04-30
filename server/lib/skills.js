// skills.js — Skill discovery, parsing, health checks, and LLM enrichment

const fs   = require('fs');
const path = require('path');
const { SKILLS_DIR, SKILL_CACHE_FILE } = require('./config');
const { getApiKey } = require('./crypto');

// ---- Parse cache (disk-backed) ----
function loadParseCache() { try { return JSON.parse(fs.readFileSync(SKILL_CACHE_FILE, 'utf8')); } catch { return {}; } }
function saveParseCache(cache) { fs.writeFileSync(SKILL_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8'); }

// ---- Frontmatter parser ----
function parseSkillFrontmatter(content) {
  const fm = {};
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return fm;
  const block = fmMatch[1].replace(/\r\n/g, '\n');
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w[\w_-]*):\s*(.+)/);
    if (m) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[m[1]] = val;
    }
  }
  return fm;
}

// ---- Trigger extraction ----
function extractTriggers(content, desc) {
  const triggers = [];
  const trigSection = content.match(/## Triggers\n([\s\S]*?)(?:\n##|$)/);
  if (trigSection) {
    trigSection[1].trim().split('\n').forEach(line => {
      const t = line.replace(/^-\s*/, '').trim();
      if (t) triggers.push(t);
    });
  }
  const slashCmds = (desc || '').match(/\/[a-z][\w-]+/g);
  if (slashCmds) slashCmds.forEach(c => { if (!triggers.includes(c)) triggers.push(c); });
  const quoted = (desc || '').match(/"([^"]{3,40})"/g);
  if (quoted) {
    quoted.forEach(q => {
      const phrase = q.replace(/"/g, '');
      if (phrase.split(' ').length <= 5 && /^[a-z]/i.test(phrase)) {
        if (!triggers.includes(phrase)) triggers.push(phrase);
      }
    });
  }
  return triggers.slice(0, 10);
}

// ---- Scan skills (cached with 5s TTL) ----
let _skillCache = null;
let _skillCacheTime = 0;
const SKILL_CACHE_TTL = 5000;

function isInsideDir(childPath, parentDir) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function findSkillDirs(rootDir) {
  const dirs = [];
  const walk = dir => {
    const rootSkillFile = path.join(dir, 'SKILL.md');
    if (fs.existsSync(rootSkillFile)) {
      dirs.push({ id: path.basename(dir), dir, skillFile: rootSkillFile });
      return;
    }

    let items = [];
    try { items = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b)); }
    catch { return; }

    items.forEach(item => {
      const fullPath = path.join(dir, item);
      let stat;
      try { stat = fs.statSync(fullPath); }
      catch { return; }
      if (!stat.isDirectory()) return;

      const skillFile = path.join(fullPath, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        dirs.push({ id: item, dir: fullPath, skillFile });
      } else {
        walk(fullPath);
      }
    });
  };
  walk(rootDir);
  return dirs;
}

function getExistingSkillIds(excludeDir = null) {
  const ids = new Set();
  if (!fs.existsSync(SKILLS_DIR)) return ids;
  findSkillDirs(SKILLS_DIR).forEach(skill => {
    if (excludeDir && isInsideDir(skill.dir, excludeDir)) return;
    ids.add(skill.id);
  });
  return ids;
}

function pruneDuplicateSkillDirs(importDir) {
  const existingIds = getExistingSkillIds(importDir);
  const seenImported = new Set();
  const removed = [];
  const kept = [];

  findSkillDirs(importDir).forEach(skill => {
    const duplicateOfExisting = existingIds.has(skill.id);
    const duplicateInsideImport = seenImported.has(skill.id);
    if (duplicateOfExisting || duplicateInsideImport) {
      fs.rmSync(skill.dir, { recursive: true, force: true });
      removed.push({
        id: skill.id,
        path: skill.dir,
        reason: duplicateOfExisting ? 'already exists' : 'duplicate in repo',
      });
      return;
    }
    seenImported.add(skill.id);
    kept.push(skill.id);
  });

  return { kept, removed };
}

function isIngestedSkill(skillDir) {
  return isInsideDir(skillDir, path.join(SKILLS_DIR, 'ingested'));
}

function categoryForSkill(skill) {
  const id = skill.id.toLowerCase();
  let content = '';
  try { content = fs.readFileSync(skill.skillFile, 'utf8').toLowerCase(); }
  catch {}

  if (id.includes('template') || id.includes('example') || content.includes('starter template')) return '00_templates';
  if (id.includes('api') || id.includes('context') || id.includes('memory') || id.includes('mcp')) return '08_meta';
  if (id.includes('github') || id.includes('repo') || id.includes('git')) return '05_integrations';
  if (id.includes('image') || id.includes('design') || id.includes('frontend')) return '03_creative';
  if (id.includes('test') || id.includes('tdd') || id.includes('debug')) return '04_engineering';
  return '99_uncategorized';
}

function removeEmptyDirs(rootDir, actions, apply) {
  if (!fs.existsSync(rootDir)) return false;
  const rel = path.relative(SKILLS_DIR, rootDir).replace(/\\/g, '/');
  if (rel.split('/').includes('.git')) return false;
  let empty = true;
  for (const item of fs.readdirSync(rootDir)) {
    const fullPath = path.join(rootDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const childEmpty = removeEmptyDirs(fullPath, actions, apply);
      if (!childEmpty) empty = false;
    } else {
      empty = false;
    }
  }
  if (rootDir === SKILLS_DIR || !empty) return false;
  actions.push({ type: 'remove-empty-dir', path: rootDir });
  if (apply) fs.rmdirSync(rootDir);
  return true;
}

function addReviewActions(actions) {
  if (!fs.existsSync(SKILLS_DIR)) return;
  const allowedFiles = new Set(['README.md', 'SKILLS_REGISTRY.md']);
  for (const item of fs.readdirSync(SKILLS_DIR)) {
    const fullPath = path.join(SKILLS_DIR, item);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && !allowedFiles.has(item)) {
      actions.push({ type: 'review-artifact', path: fullPath, reason: 'non-skill file in skills root' });
      continue;
    }
    if (!stat.isDirectory() || item === 'ingested') continue;
    const hasSkills = findSkillDirs(fullPath).length > 0;
    if (!hasSkills) actions.push({ type: 'review-artifact', path: fullPath, reason: 'folder contains no SKILL.md files' });
  }
}

function organiseSkills({ apply = false } = {}) {
  const actions = [];
  const keptIds = new Map();
  const skills = findSkillDirs(SKILLS_DIR);

  skills.forEach(skill => {
    const current = keptIds.get(skill.id);
    if (!current) {
      keptIds.set(skill.id, skill);
      return;
    }

    const currentImported = isIngestedSkill(current.dir);
    const nextImported = isIngestedSkill(skill.dir);
    const removeSkill = currentImported && !nextImported ? current : skill;
    const keepSkill = removeSkill === current ? skill : current;

    if (removeSkill === current) keptIds.set(skill.id, keepSkill);
    const action = {
      type: removeSkill === current || nextImported ? 'remove-duplicate' : 'merge-needed',
      id: removeSkill.id,
      keepPath: keepSkill.dir,
      removePath: removeSkill.dir,
    };
    actions.push(action);
    if (apply && action.type === 'remove-duplicate') fs.rmSync(removeSkill.dir, { recursive: true, force: true });
  });

  findSkillDirs(SKILLS_DIR).forEach(skill => {
    if (isIngestedSkill(skill.dir)) return;
    const rel = path.relative(SKILLS_DIR, skill.dir).replace(/\\/g, '/');
    const parts = rel.split('/');
    if (parts.length !== 1) return;

    const category = categoryForSkill(skill);
    const targetDir = path.join(SKILLS_DIR, category, skill.id);
    if (targetDir === skill.dir) return;
    actions.push({ type: 'move-to-category', id: skill.id, from: skill.dir, to: targetDir, category });
    if (apply) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      if (!fs.existsSync(targetDir)) fs.renameSync(skill.dir, targetDir);
    }
  });

  removeEmptyDirs(SKILLS_DIR, actions, apply);
  addReviewActions(actions);
  if (apply) invalidateSkillCache();
  return {
    ok: true,
    apply,
    actions,
    summary: {
      moved: actions.filter(a => a.type === 'move-to-category').length,
      duplicatesRemoved: actions.filter(a => a.type === 'remove-duplicate').length,
      mergeNeeded: actions.filter(a => a.type === 'merge-needed').length,
      emptyDirsRemoved: actions.filter(a => a.type === 'remove-empty-dir').length,
      reviewNeeded: actions.filter(a => a.type === 'review-artifact').length,
    },
  };
}

function scanSkills(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _skillCache && (now - _skillCacheTime) < SKILL_CACHE_TTL) return _skillCache;

  const map = {};
  if (!fs.existsSync(SKILLS_DIR)) return map;
  const cache = loadParseCache();

  const scan = (dir, cat = 'Uncategorized') => {
    const items = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b));
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const id = item;
          if (map[id]) return;
          const content = fs.readFileSync(skillFile, 'utf8');
          const fm = parseSkillFrontmatter(content);
          const cached = cache[id];
          let desc = cached?.description || fm.description || '';
          if (!desc) {
            const headingMatch = content.match(/^#\s+.+\r?\n\r?\n(.+)/m);
            if (headingMatch) desc = headingMatch[1].trim();
          }
          const triggers = cached?.triggers || extractTriggers(content, desc);
          map[id] = {
            id, name: fm.name || id, cat,
            type: 'custom',
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
  _skillCache = map;
  _skillCacheTime = now;
  return map;
}

function invalidateSkillCache() {
  _skillCache = null;
  _skillCacheTime = 0;
}

// ---- Skill health check ----
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

// ---- Count SKILL.md files in a directory tree ----
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

const OLLAMA_URL = 'http://127.0.0.1:11434';

async function getOllamaModels() {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data?.models) ? data.models.map(item => item.name || item.model).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function resolveOllamaModel(requested = '') {
  const models = await getOllamaModels();
  if (!models.length) throw new Error('Local Ollama is not reachable, or no models are installed.');
  const trimmed = String(requested || '').trim();
  if (!trimmed) return models.includes('llama3.1:8b') ? 'llama3.1:8b' : models[0];
  if (models.includes(trimmed)) return trimmed;
  const compatible = models.find(name => name === `${trimmed}:latest` || name.startsWith(`${trimmed}:`));
  if (compatible) return compatible;
  throw new Error(`Ollama model "${trimmed}" is not installed. Available: ${models.join(', ')}`);
}

async function runLlmJson(prompt, { provider = 'anthropic', apiKey = '', model = '', signal } = {}, maxTokens = 600) {
  if (provider === 'ollama') {
    const resolvedModel = await resolveOllamaModel(model);
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: resolvedModel, prompt, stream: false, format: 'json' }),
      signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Ollama request failed (${resp.status})`);
    }
    const data = await resp.json();
    return data?.response || '';
  }
  const key = apiKey || getApiKey('ANTHROPIC_API_KEY');
  if (!key) throw new Error('No Anthropic API key configured for this cleanup run.');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal,
  });
  const data = await resp.json();
  return data?.content?.[0]?.text || '';
}

function extractJsonObject(text) {
  const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

// Per-call timeout for LLM parse requests. Anthropic API typically responds in
// 1-3s; Ollama can take longer for large local models, so this is generous.
const PARSE_TIMEOUT_MS = 60_000;
const PARSE_CONCURRENCY = 4;

// ---- LLM-powered skill parsing ----
async function llmParseSkill(skillPath, options = {}) {
  const content = fs.readFileSync(skillPath, 'utf8').substring(0, 4000);
  try {
    return extractJsonObject(await runLlmJson(`Parse this SKILL.md and return ONLY a JSON object with these fields:
- "description": one-sentence summary of what this skill does (max 120 chars)
- "triggers": array of 3-5 short trigger phrases a user would say to invoke this skill

  SKILL.md content:
  ${content}`, options, 300));
  } catch (e) {
    console.error('LLM parse error:', e.message);
    if (/api key|anthropic|ollama|fetch|request failed|not installed|reachable|abort/i.test(e.message)) throw e;
  }
  return null;
}

// Parse every skill that needs parsing, concurrently with a small worker pool.
// Per-call timeout via AbortSignal. On the first transport/auth error, aborts
// remaining in-flight calls and rethrows so the caller can fail-fast.
async function parseAllNeedingParse(options = {}) {
  const skills = Object.values(scanSkills()).filter(s => s.needsParse);
  if (!skills.length) return { parsed: 0, total: 0, skills: [] };

  const cache = loadParseCache();
  const controller = new AbortController();
  let parsed = 0;
  let firstError = null;
  let cursor = 0;

  const worker = async () => {
    while (cursor < skills.length && !firstError) {
      const skill = skills[cursor++];
      const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);
      try {
        const result = await llmParseSkill(skill.path, { ...options, signal: controller.signal });
        if (result) {
          cache[skill.id] = {
            description: result.description || '',
            triggers: Array.isArray(result.triggers) ? result.triggers : [],
            parsedAt: Date.now(),
          };
          parsed++;
        }
      } catch (e) {
        if (!firstError) {
          firstError = e;
          controller.abort();
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  };

  const workerCount = Math.min(PARSE_CONCURRENCY, skills.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  // Persist whatever we successfully parsed before the error.
  saveParseCache(cache);
  invalidateSkillCache();

  if (firstError) throw firstError;
  return { parsed, total: skills.length };
}

async function llmReviewSimilarSkills(options = {}) {
  const skills = Object.values(scanSkills()).map(skill => ({
    id: skill.id,
    label: skill.label || skill.id,
    description: skill.desc || '',
    triggers: skill.triggers || [],
    category: skill.category || '',
    source: skill.source || '',
  }));
  if (skills.length < 2) return { ok: true, groups: [] };
  try {
    const parsed = extractJsonObject(await runLlmJson(`Review these SKILL.md metadata records and flag only likely duplicate or near-duplicate skills.

Rules:
- Do not rewrite or edit any skill.
- Only flag skills that appear to solve the same user need with different wording.
- Ignore broad category similarity. "coding" and "review" alone are not enough.
- Return ONLY JSON: {"groups":[{"skills":["id-a","id-b"],"reason":"short reason","confidence":0.0}]}
- Keep confidence between 0 and 1.
- Return at most 12 groups.

Skills:
${JSON.stringify(skills).slice(0, 50000)}`, options, 1200));
    if (!parsed) return { ok: false, error: 'AI review returned no JSON' };
    const ids = new Set(skills.map(skill => skill.id));
    const groups = Array.isArray(parsed.groups) ? parsed.groups
      .map(group => ({
        skills: Array.isArray(group.skills) ? group.skills.filter(id => ids.has(id)).slice(0, 5) : [],
        reason: String(group.reason || '').slice(0, 220),
        confidence: Number(group.confidence || 0),
      }))
      .filter(group => group.skills.length > 1 && group.confidence >= 0.55)
      .slice(0, 12) : [];
    return { ok: true, groups, reviewed: skills.length };
  } catch (e) {
    console.error('LLM similarity review error:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  scanSkills, invalidateSkillCache, skillHealthCheck,
  countSkillFiles, llmParseSkill, parseAllNeedingParse, llmReviewSimilarSkills, pruneDuplicateSkillDirs, organiseSkills, getOllamaModels,
  loadParseCache, saveParseCache,
};
