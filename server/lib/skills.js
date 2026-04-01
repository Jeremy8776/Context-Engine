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

function scanSkills(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _skillCache && (now - _skillCacheTime) < SKILL_CACHE_TTL) return _skillCache;

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
          let desc = cached?.description || fm.description || '';
          if (!desc) {
            const headingMatch = content.match(/^#\s+.+\r?\n\r?\n(.+)/m);
            if (headingMatch) desc = headingMatch[1].trim();
          }
          const triggers = cached?.triggers || extractTriggers(content, desc);
          map[id] = {
            id, name: fm.name || id, cat,
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

// ---- LLM-powered skill parsing ----
async function llmParseSkill(skillPath) {
  const apiKey = getApiKey('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const content = fs.readFileSync(skillPath, 'utf8').substring(0, 4000);
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

module.exports = {
  scanSkills, invalidateSkillCache, skillHealthCheck,
  countSkillFiles, llmParseSkill,
  loadParseCache, saveParseCache,
};
