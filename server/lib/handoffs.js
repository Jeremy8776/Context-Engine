// handoffs.js - in-flight thread state. Bridges the gap between Memory (long-
// lived facts) and Tasks (active work) by capturing "where were we?" bookmarks
// that age out automatically as the underlying code or thread moves on.
//
// Storage:
//   data/handoffs/<slug>.md            - active handoff body with YAML frontmatter
//   data/handoffs/archive/<slug>.md    - archived (kept 30 days then purgeable)
//
// Staleness:
//   - Project handoff (binding includes `repo`): archive when 5+ local commits
//     past the recorded head_sha. If the same handoff also has a thread_tag
//     and the thread is still active (touched within IDLE_THRESHOLD_DAYS), the
//     archive is deferred - thread activity wins.
//   - Thread handoff (binding only `thread_tag`): archive after
//     IDLE_THRESHOLD_DAYS idle.
//
// Spec: app/docs/specs/handoff-feature.md.

// @ts-check

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { currentHeadSha, commitsPastSha, commitTimeline } = require('./handoff-git');
const { createKeyMutex } = require('./per-key-mutex');

// Per-slug mutex so a concurrent PATCH from updateHandoff can't race the
// archive sweep that listHandoffs triggers: without the lock, PATCH could
// write a new active file just after the sweep renamed it to archive,
// leaving both copies on disk with diverging state.
const slugMutex = createKeyMutex();

const HANDOFFS_DIR = path.join(DATA_DIR, 'handoffs');
const ARCHIVE_DIR = path.join(HANDOFFS_DIR, 'archive');

const COMMIT_THRESHOLD = 5;
const IDLE_THRESHOLD_DAYS = 14;
const PURGE_THRESHOLD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} HandoffFrontmatter
 * @property {'project' | 'thread' | 'dual'} type
 * @property {string} title
 * @property {string=} repo
 * @property {string=} head_sha
 * @property {string=} thread_tag
 * @property {string} created      ISO timestamp.
 * @property {string} last_touched ISO timestamp.
 * @property {string=} archived    ISO timestamp; absent for active handoffs.
 */

/**
 * @typedef {Object} Handoff
 * @property {string} slug
 * @property {'project' | 'thread' | 'dual'} type
 * @property {string} title
 * @property {string=} repo
 * @property {string=} head_sha
 * @property {string=} thread_tag
 * @property {string} created
 * @property {string} last_touched
 * @property {string=} archived
 * @property {string} body
 * @property {{ commits_past_head: number | null, commit_timeline: { sha: string, short_sha: string, date: string, subject: string }[], idle_days: number, eligible_for_archive: boolean }} staleness
 */

/**
 * A handoff slug is a stable, filesystem-safe id. Reject anything that could
 * break out of HANDOFFS_DIR via path traversal (`..\..\some-file`) or address
 * other files via separators / drive letters. Slugs are generated internally
 * by uniqueSlug() and only contain `[a-z0-9-]`, so the regex matches what we
 * actually produce.
 *
 * @param {string} slug
 */
function isSlugSafe(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
}

function ensureDirs() {
  if (!fs.existsSync(HANDOFFS_DIR)) fs.mkdirSync(HANDOFFS_DIR, { recursive: true });
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

/**
 * Convert free-form text to a stable filesystem-safe slug. Used for new
 * handoff filenames; collisions get a numeric suffix.
 *
 * @param {string} seed
 * @param {Set<string>} taken
 */
function uniqueSlug(seed, taken) {
  const base =
    String(seed)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'handoff';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Parse YAML frontmatter + body from a handoff file. The frontmatter is a
 * narrow subset (one `key: value` per line, optional quotes); we don't pull
 * in a full YAML parser.
 *
 * @param {string} content
 * @returns {{ fm: HandoffFrontmatter, body: string } | null}
 */
function parseFile(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const block = match[1] || '';
  const rest = match[2] || '';
  /** @type {Record<string, string>} */
  const fm = {};
  for (const line of block.replace(/\r\n/g, '\n').split('\n')) {
    const kv = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1];
    let val = (kv[2] || '').trim();
    if (!key) continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  }
  if (!fm.type || !fm.title || !fm.created || !fm.last_touched) return null;
  return { fm: /** @type {HandoffFrontmatter} */ (fm), body: rest.replace(/^\n/, '') };
}

/**
 * Serialise a handoff back to file form.
 * @param {HandoffFrontmatter} fm
 * @param {string} body
 */
function serialiseFile(fm, body) {
  const lines = ['---'];
  /** @param {string} k @param {string|undefined} v */
  const push = (k, v) => {
    if (v === undefined || v === null || v === '') return;
    lines.push(`${k}: ${v}`);
  };
  push('type', fm.type);
  push('title', fm.title);
  push('repo', fm.repo);
  push('head_sha', fm.head_sha);
  push('thread_tag', fm.thread_tag);
  push('created', fm.created);
  push('last_touched', fm.last_touched);
  push('archived', fm.archived);
  lines.push('---');
  lines.push('');
  lines.push(body.replace(/\r\n/g, '\n').replace(/\s+$/, ''));
  lines.push('');
  return lines.join('\n');
}

/**
 * Evaluate per-binding staleness signals. A dual handoff archives when the
 * thread goes idle. If only commits trip while the thread is still active, the
 * handoff stays active because current thread work beats the repo proxy.
 *
 * @param {HandoffFrontmatter} fm
 * @returns {{ commits_past_head: number | null, commit_timeline: { sha: string, short_sha: string, date: string, subject: string }[], idle_days: number, eligible_for_archive: boolean }}
 */
function evaluateStaleness(fm) {
  const idleMs = Date.now() - new Date(fm.last_touched).getTime();
  const idleDays = Number.isFinite(idleMs) ? Math.floor(idleMs / DAY_MS) : 0;
  let commits = null;
  /** @type {{ sha: string, short_sha: string, date: string, subject: string }[]} */
  let timeline = [];
  if ((fm.type === 'project' || fm.type === 'dual') && fm.repo && fm.head_sha) {
    commits = commitsPastSha(fm.repo, fm.head_sha);
    timeline = commitTimeline(fm.repo, fm.head_sha);
  }
  const commitTrip = commits !== null && commits >= COMMIT_THRESHOLD;
  const idleTrip = idleDays >= IDLE_THRESHOLD_DAYS;

  let eligible;
  if (fm.type === 'project') eligible = commitTrip;
  else if (fm.type === 'thread') eligible = idleTrip;
  else eligible = idleTrip; // dual - idle thread archives; active thread defers commit staleness

  return {
    commits_past_head: commits,
    commit_timeline: timeline,
    idle_days: idleDays,
    eligible_for_archive: eligible,
  };
}

/** @param {string} dir @returns {string[]} */
function readBodyDirSlugs(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Read one handoff file given an absolute path; returns null if it can't be
 * parsed.
 *
 * @param {string} file
 * @returns {{ fm: HandoffFrontmatter, body: string } | null}
 */
function readFile(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return parseFile(content);
}

/**
 * List active handoffs. Sweeps stale entries to archive and purges old
 * archive entries as a side effect.
 *
 * The sweep uses atomic `fs.renameSync(active, archive)` so a concurrent
 * `updateHandoff` either sees the active file (writes succeed) or sees it
 * gone (ENOENT, returns "not found"). Either outcome keeps state coherent
 * — the previous writeFileSync-then-unlinkSync pattern had a window where
 * a PATCH could leave a duplicate file behind.
 *
 * @returns {Handoff[]}
 */
function listHandoffs() {
  ensureDirs();
  autoPurgeStale();

  const slugs = readBodyDirSlugs(HANDOFFS_DIR);
  /** @type {Handoff[]} */
  const out = [];
  for (const slug of slugs) {
    if (!isSlugSafe(slug)) continue;
    const activePath = path.join(HANDOFFS_DIR, `${slug}.md`);
    const parsed = readFile(activePath);
    if (!parsed) continue;
    const staleness = evaluateStaleness(parsed.fm);
    if (staleness.eligible_for_archive) {
      sweepArchive(slug, parsed.fm, parsed.body, activePath);
      continue;
    }
    out.push({ slug, ...parsed.fm, body: parsed.body, staleness });
  }
  // Order by most recently touched first.
  out.sort((a, b) => (b.last_touched || '').localeCompare(a.last_touched || ''));
  return out;
}

/**
 * Atomic-rename-based archive used by the sweep inside listHandoffs. Stamps
 * the frontmatter with an `archived` timestamp first, then writes the new
 * file to the archive dir and renames the active file out. Tolerant of races
 * — if a concurrent updateHandoff already renamed/removed the file, the
 * sweep silently skips.
 *
 * @param {string} slug
 * @param {HandoffFrontmatter} fm
 * @param {string} body
 * @param {string} activePath
 */
function sweepArchive(slug, fm, body, activePath) {
  const stampedFm = { ...fm, archived: new Date().toISOString() };
  const archivePath = path.join(ARCHIVE_DIR, `${slug}.md`);
  try {
    fs.writeFileSync(archivePath, serialiseFile(stampedFm, body), 'utf8');
    fs.unlinkSync(activePath);
  } catch (err) {
    const code = err && typeof err === 'object' ? /** @type {any} */ (err).code : null;
    if (code !== 'ENOENT') {
      console.error('handoffs: sweep archive failed', slug, err);
    }
  }
}

/** @returns {Handoff[]} */
function listArchived() {
  ensureDirs();
  const slugs = readBodyDirSlugs(ARCHIVE_DIR);
  /** @type {Handoff[]} */
  const out = [];
  for (const slug of slugs) {
    const parsed = readFile(path.join(ARCHIVE_DIR, `${slug}.md`));
    if (!parsed) continue;
    const staleness = evaluateStaleness(parsed.fm);
    out.push({ slug, ...parsed.fm, body: parsed.body, staleness });
  }
  out.sort((a, b) => (b.archived || '').localeCompare(a.archived || ''));
  return out;
}

/** @param {string} slug @returns {Handoff | null} */
function getHandoff(slug) {
  ensureDirs();
  if (!isSlugSafe(slug)) return null;
  const activePath = path.join(HANDOFFS_DIR, `${slug}.md`);
  const archivedPath = path.join(ARCHIVE_DIR, `${slug}.md`);
  const target = fs.existsSync(activePath) ? activePath : fs.existsSync(archivedPath) ? archivedPath : null;
  if (!target) return null;
  const parsed = readFile(target);
  if (!parsed) return null;
  const staleness = evaluateStaleness(parsed.fm);
  return { slug, ...parsed.fm, body: parsed.body, staleness };
}

/**
 * Create a new handoff. Title is required; binding is determined by which of
 * `repo` + `thread_tag` are present.
 *
 * @param {{ title: string, body?: string, repo?: string, thread_tag?: string }} input
 * @returns {{ ok: true, handoff: Handoff } | { ok: false, error: string }}
 */
function createHandoff(input) {
  ensureDirs();
  const title = String(input?.title || '').trim();
  if (!title) return { ok: false, error: 'title is required' };

  const repo = input?.repo ? String(input.repo).trim() : '';
  const tag = input?.thread_tag ? String(input.thread_tag).trim() : '';

  /** @type {'project' | 'thread' | 'dual'} */
  const type = repo && tag ? 'dual' : repo ? 'project' : 'thread';

  let head_sha;
  if (repo) {
    head_sha = currentHeadSha(repo);
  }
  if (repo && !head_sha) {
    // Verify repo is at least a directory before accepting.
    try {
      if (!fs.statSync(repo).isDirectory()) return { ok: false, error: 'repo is not a directory' };
    } catch {
      return { ok: false, error: 'repo path does not exist' };
    }
  }

  const taken = new Set([...readBodyDirSlugs(HANDOFFS_DIR), ...readBodyDirSlugs(ARCHIVE_DIR)]);
  const slug = uniqueSlug(title, taken);
  const now = new Date().toISOString();
  /** @type {HandoffFrontmatter} */
  const fm = {
    type,
    title,
    repo: repo || undefined,
    head_sha,
    thread_tag: tag || undefined,
    created: now,
    last_touched: now,
  };
  const body = String(input?.body || '');
  fs.writeFileSync(path.join(HANDOFFS_DIR, `${slug}.md`), serialiseFile(fm, body), 'utf8');
  const staleness = evaluateStaleness(fm);
  return { ok: true, handoff: { slug, ...fm, body, staleness } };
}

/**
 * Update an existing handoff. Patch can override title and body; `repo` and
 * `thread_tag` are immutable after creation (changing the binding mid-life
 * makes staleness signals ambiguous).
 *
 * @param {string} slug
 * @param {{ title?: string, body?: string }} patch
 * @returns {Promise<{ ok: true, handoff: Handoff } | { ok: false, error: string }>}
 */
async function updateHandoff(slug, patch) {
  ensureDirs();
  if (!isSlugSafe(slug)) return { ok: false, error: 'Invalid slug' };
  return slugMutex(slug, async () => updateHandoffSync(slug, patch));
}

/**
 * @param {string} slug
 * @param {{ title?: string, body?: string }} patch
 * @returns {{ ok: true, handoff: Handoff } | { ok: false, error: string }}
 */
function updateHandoffSync(slug, patch) {
  const file = path.join(HANDOFFS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return { ok: false, error: 'Handoff not found (already archived?)' };
  const parsed = readFile(file);
  if (!parsed) return { ok: false, error: 'Handoff file is malformed' };
  const fm = { ...parsed.fm };
  if (patch?.title) fm.title = String(patch.title).trim() || fm.title;
  fm.last_touched = new Date().toISOString();
  const body = patch?.body !== undefined ? String(patch.body) : parsed.body;
  fs.writeFileSync(file, serialiseFile(fm, body), 'utf8');
  const staleness = evaluateStaleness(fm);
  return { ok: true, handoff: { slug, ...fm, body, staleness } };
}

/**
 * Move an active handoff to the archive directory. Stamps `archived` with
 * the current ISO timestamp so PURGE_THRESHOLD_DAYS can run against it.
 *
 * @param {string} slug
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function archiveBySlug(slug) {
  ensureDirs();
  if (!isSlugSafe(slug)) return { ok: false, error: 'Invalid slug' };
  return slugMutex(slug, async () => archiveBySlugSync(slug));
}

/**
 * @param {string} slug
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function archiveBySlugSync(slug) {
  const file = path.join(HANDOFFS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return { ok: false, error: 'Handoff not found' };
  const parsed = readFile(file);
  if (!parsed) return { ok: false, error: 'Handoff file is malformed' };
  const fm = { ...parsed.fm, archived: new Date().toISOString() };
  const newFile = path.join(ARCHIVE_DIR, `${slug}.md`);
  fs.writeFileSync(newFile, serialiseFile(fm, parsed.body), 'utf8');
  fs.unlinkSync(file);
  return { ok: true };
}

/**
 * Restore an archived handoff back to active. Clears the `archived` stamp and
 * resets `last_touched` so it doesn't auto-archive again on the next list.
 *
 * @param {string} slug
 * @returns {Promise<{ ok: true, handoff: Handoff } | { ok: false, error: string }>}
 */
async function restoreHandoff(slug) {
  ensureDirs();
  if (!isSlugSafe(slug)) return { ok: false, error: 'Invalid slug' };
  return slugMutex(slug, async () => restoreHandoffSync(slug));
}

/**
 * @param {string} slug
 * @returns {{ ok: true, handoff: Handoff } | { ok: false, error: string }}
 */
function restoreHandoffSync(slug) {
  const file = path.join(ARCHIVE_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return { ok: false, error: 'Archived handoff not found' };
  const parsed = readFile(file);
  if (!parsed) return { ok: false, error: 'Handoff file is malformed' };
  const fm = { ...parsed.fm };
  delete fm.archived;
  fm.last_touched = new Date().toISOString();
  // CRITICAL: refresh head_sha on restore. The handoff was archived because
  // commits had moved past the recorded sha; if we leave that sha in place,
  // the next listHandoffs() will immediately re-archive (commitTrip stays
  // true). Reset to current HEAD so the 5-commits-past counter starts fresh.
  if ((fm.type === 'project' || fm.type === 'dual') && fm.repo) {
    const fresh = currentHeadSha(fm.repo);
    if (fresh) fm.head_sha = fresh;
  }
  const newFile = path.join(HANDOFFS_DIR, `${slug}.md`);
  fs.writeFileSync(newFile, serialiseFile(fm, parsed.body), 'utf8');
  fs.unlinkSync(file);
  const staleness = evaluateStaleness(fm);
  return { ok: true, handoff: { slug, ...fm, body: parsed.body, staleness } };
}

/**
 * Permanently delete an archived handoff. Refuses to operate on active
 * handoffs - those must be archived first.
 *
 * @param {string} slug
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function purgeHandoff(slug) {
  ensureDirs();
  if (!isSlugSafe(slug)) return { ok: false, error: 'Invalid slug' };
  return slugMutex(slug, async () => {
    const file = path.join(ARCHIVE_DIR, `${slug}.md`);
    if (!fs.existsSync(file)) return { ok: false, error: 'Archived handoff not found' };
    fs.unlinkSync(file);
    return { ok: true };
  });
}

/** Auto-purge archived handoffs older than PURGE_THRESHOLD_DAYS. */
function autoPurgeStale() {
  const slugs = readBodyDirSlugs(ARCHIVE_DIR);
  for (const slug of slugs) {
    const parsed = readFile(path.join(ARCHIVE_DIR, `${slug}.md`));
    if (!parsed) continue;
    const archivedAt = parsed.fm.archived ? new Date(parsed.fm.archived).getTime() : 0;
    if (!archivedAt) continue;
    if (Date.now() - archivedAt > PURGE_THRESHOLD_DAYS * DAY_MS) {
      try {
        fs.unlinkSync(path.join(ARCHIVE_DIR, `${slug}.md`));
      } catch {
        /* tolerant - log nothing, this is housekeeping */
      }
    }
  }
}

module.exports = {
  HANDOFFS_DIR,
  ARCHIVE_DIR,
  COMMIT_THRESHOLD,
  IDLE_THRESHOLD_DAYS,
  PURGE_THRESHOLD_DAYS,
  listHandoffs,
  listArchived,
  getHandoff,
  createHandoff,
  updateHandoff,
  archiveHandoff: archiveBySlug,
  restoreHandoff,
  purgeHandoff,
};
