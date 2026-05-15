// @ts-check

const fs = require('fs');
const path = require('path');
const { createHandoff, listHandoffs, updateHandoff } = require('./handoffs');

const PROJECT_HANDOFF_RELATIVE = path.join('.context-engine', 'handoff.md');

/** @param {string} repo */
function projectHandoffPath(repo) {
  return path.join(repo, PROJECT_HANDOFF_RELATIVE);
}

/** @param {string | undefined} value */
function normalizeRepo(value) {
  if (!value) return '';
  try {
    return path.resolve(value);
  } catch {
    return String(value);
  }
}

/** @param {string} content */
function parseLooseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: content };
  /** @type {Record<string, string>} */
  const fm = {};
  for (const line of (match[1] || '').replace(/\r\n/g, '\n').split('\n')) {
    const kv = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1];
    if (!key) continue;
    fm[key] = (kv[2] || '').trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: match[2] || '' };
}

/**
 * @param {string} content
 * @param {string} repo
 */
function parseProjectHandoff(content, repo) {
  const parsed = parseLooseFrontmatter(content);
  const body = parsed.body.replace(/\r\n/g, '\n').trim();
  const heading = body.match(/^#\s+(.+)$/m);
  return {
    title: (parsed.fm.title || heading?.[1] || `${path.basename(repo)} handoff`).trim(),
    thread_tag: (parsed.fm.thread_tag || '').trim() || undefined,
    body,
  };
}

/**
 * Pull `.context-engine/handoff.md` from a project directory into the managed
 * handoff store. Existing titles are preserved so the UI remains human-owned.
 *
 * @param {string} repo
 * @returns {Promise<{ ok: true, handoff: import('./handoffs').Handoff, source: string, created: boolean } | { ok: false, error: string, source?: string }>}
 */
async function syncProjectHandoff(repo) {
  const repoPath = normalizeRepo(repo);
  if (!repoPath) return { ok: false, error: 'repo is required' };
  try {
    if (!fs.statSync(repoPath).isDirectory()) return { ok: false, error: 'repo is not a directory' };
  } catch {
    return { ok: false, error: 'repo path does not exist' };
  }

  const source = projectHandoffPath(repoPath);
  let content;
  try {
    content = fs.readFileSync(source, 'utf8');
  } catch {
    return { ok: false, error: `Project handoff file not found at ${PROJECT_HANDOFF_RELATIVE}`, source };
  }

  const parsed = parseProjectHandoff(content, repoPath);
  const repoKey = repoPath.toLowerCase();
  const existing = listHandoffs().find((handoff) => {
    const sameRepo = normalizeRepo(handoff.repo).toLowerCase() === repoKey;
    if (!sameRepo) return false;
    return parsed.thread_tag ? handoff.thread_tag === parsed.thread_tag : true;
  });

  if (existing) {
    const updated = await updateHandoff(existing.slug, { body: parsed.body });
    if (!updated.ok) return { ok: false, error: updated.error, source };
    return { ok: true, handoff: updated.handoff, source, created: false };
  }

  const created = createHandoff({
    title: parsed.title,
    repo: repoPath,
    thread_tag: parsed.thread_tag,
    body: parsed.body,
  });
  if (!created.ok) return { ok: false, error: created.error, source };
  return { ok: true, handoff: created.handoff, source, created: true };
}

module.exports = {
  PROJECT_HANDOFF_RELATIVE,
  projectHandoffPath,
  syncProjectHandoff,
};
