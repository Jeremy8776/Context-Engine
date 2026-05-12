// skill-sources.js — external skill directory registry.
//
// Stores a list of additional directories CE reads SKILL.md files from
// alongside its own SKILLS_DIR. The implicit `internal` source is always
// returned first; stored sources follow in registration order. CE never
// writes to external sources; that's why `writable` is always false.
//
// Spec: docs/specs/skill-sources.md.

// @ts-check

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DATA_DIR, SKILLS_DIR, HOMEDIR } = require('./config');
const { checkSafeWritePath } = require('./security');

const SOURCES_FILE = path.join(DATA_DIR, 'skill-sources.json');

/**
 * @typedef {Object} SkillSource
 * @property {string} id        Stable id (slug or "internal").
 * @property {string} label     Human-readable label.
 * @property {string} path      Absolute filesystem path to a skills root.
 * @property {'internal' | 'external'} type
 * @property {boolean} writable Always false for external sources.
 * @property {string=} added    ISO timestamp when registered.
 * @property {string=} lastSeen ISO timestamp of last successful read.
 */

/** @returns {SkillSource} */
function internalSource() {
  return {
    id: 'internal',
    label: 'Context Engine',
    path: SKILLS_DIR,
    type: 'internal',
    writable: true,
  };
}

/** @returns {SkillSource[]} */
function readStored() {
  try {
    const raw = fs.readFileSync(SOURCES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.sources)) return parsed.sources;
  } catch {
    /* missing or unreadable — treat as no external sources */
  }
  return [];
}

/** @param {SkillSource[]} sources */
function writeStored(sources) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SOURCES_FILE, JSON.stringify({ sources }, null, 2), 'utf8');
}

/**
 * Returns implicit-internal followed by every registered external source.
 * @returns {SkillSource[]}
 */
function listSources() {
  return [internalSource(), ...readStored()];
}

/** @param {string} id @returns {SkillSource | null} */
function getSource(id) {
  if (id === 'internal') return internalSource();
  return readStored().find((s) => s.id === id) || null;
}

/**
 * Derive a stable slug from label/path. Collides resolved by suffixing -2, -3, ...
 * @param {string} seed
 * @param {Set<string>} taken
 */
function uniqueId(seed, taken) {
  const base = String(seed)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source';
  if (base === 'internal') return uniqueId(base + '-ext', taken);
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/**
 * Validate and register an external skill source. Returns the new record or
 * an Error-shaped result with a user-readable reason.
 *
 * @param {{ path: string, label?: string }} input
 * @returns {{ ok: true, source: SkillSource } | { ok: false, error: string }}
 */
function addSource(input) {
  const rawPath = String(input?.path || '').trim();
  if (!rawPath) return { ok: false, error: 'path is required' };

  let resolved;
  try {
    resolved = path.resolve(rawPath);
  } catch (e) {
    return { ok: false, error: `Invalid path: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Reuse the write-path denylist as a read-path denylist. We're not writing,
  // but we still don't want to register hostile paths that future export flows
  // could turn into exfiltration vectors. Same protected dirs apply.
  const denyReason = checkSafeWritePath(resolved);
  if (denyReason) return { ok: false, error: denyReason };

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, error: 'Path does not exist on this machine' };
  }
  if (!stat.isDirectory()) return { ok: false, error: 'Path is not a directory' };

  // Refuse paths inside CE's own skills tree — that's already the internal source.
  if (resolved === SKILLS_DIR || resolved.startsWith(SKILLS_DIR + path.sep)) {
    return { ok: false, error: 'Path is already inside Context Engine\'s skills directory' };
  }

  const stored = readStored();

  // Refuse duplicate paths (compare resolved + normalized).
  if (stored.some((s) => path.resolve(s.path) === resolved)) {
    return { ok: false, error: 'This source is already linked' };
  }

  const taken = new Set(stored.map((s) => s.id));
  taken.add('internal');
  const label = String(input?.label || '').trim() || path.basename(resolved) || 'External skills';
  const id = uniqueId(label, taken);

  /** @type {SkillSource} */
  const source = {
    id,
    label,
    path: resolved,
    type: 'external',
    writable: false,
    added: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  writeStored([...stored, source]);
  return { ok: true, source };
}

/**
 * @param {string} id
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function removeSource(id) {
  if (id === 'internal') return { ok: false, error: 'Cannot remove the internal source' };
  const stored = readStored();
  const filtered = stored.filter((s) => s.id !== id);
  if (filtered.length === stored.length) return { ok: false, error: 'Source not found' };
  writeStored(filtered);
  return { ok: true };
}

/**
 * Count SKILL.md files under a directory tree. Tolerant of missing dirs.
 * @param {string} dir
 * @returns {number}
 */
function countSkillFiles(dir) {
  let count = 0;
  /** @param {string} d */
  const walk = (d) => {
    let items;
    try {
      items = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(d, item);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full);
      else if (item === 'SKILL.md') count++;
    }
  };
  walk(dir);
  return count;
}

/**
 * Probe known host-app skill directory conventions. Returns one entry per
 * probed location, regardless of whether it exists — UI decides what to show.
 *
 * Project-scoped probes iterate registered workspaces (data/workspaces.json)
 * because CWD on this process is CE's install dir, not the user's project.
 *
 * @returns {Array<{ path: string, label: string, exists: boolean, skillCount: number, alreadyLinked: boolean }>}
 */
function scanHostSkillPaths() {
  /** @type {Array<{ path: string, label: string }>} */
  const probes = [];

  // Global host-app skill dirs.
  probes.push({ path: path.join(HOMEDIR, '.claude', 'skills'), label: 'Claude Code (global)' });
  probes.push({ path: path.join(HOMEDIR, '.opencode', 'skills'), label: 'OpenCode (global)' });

  // Per-workspace probes. Workspaces are user-registered project roots.
  /** @type {string[]} */
  let workspaces = [];
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'workspaces.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.workspaces)) {
      workspaces = parsed.workspaces
        .map(/** @param {any} w */ (w) => (typeof w === 'string' ? w : w?.path))
        .filter(/** @param {any} p */ (p) => typeof p === 'string' && p.length > 0);
    }
  } catch {
    /* no workspaces file or invalid — fine, just skip project probes */
  }

  for (const ws of workspaces) {
    const base = path.basename(ws) || ws;
    probes.push({ path: path.join(ws, '.claude', 'skills'), label: `Claude Code in ${base}` });
    probes.push({ path: path.join(ws, '.clinerules'), label: `Cline / Roo in ${base}` });
    probes.push({ path: path.join(ws, '.continue', 'rules'), label: `Continue.dev in ${base}` });
  }

  const stored = readStored();
  const linkedPaths = new Set(stored.map((s) => path.resolve(s.path)));

  return probes.map((probe) => {
    const resolved = path.resolve(probe.path);
    let exists = false;
    try {
      exists = fs.statSync(resolved).isDirectory();
    } catch {
      exists = false;
    }
    return {
      path: resolved,
      label: probe.label,
      exists,
      skillCount: exists ? countSkillFiles(resolved) : 0,
      alreadyLinked: linkedPaths.has(resolved),
    };
  });
}

// Re-export under the module namespace; the os import is part of the runtime
// path resolution. (Suppress unused-import linter where applicable.)
void os;

module.exports = {
  listSources,
  getSource,
  addSource,
  removeSource,
  scanHostSkillPaths,
};
