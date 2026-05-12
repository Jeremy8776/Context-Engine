// @ts-check

const fs = require('fs');
const path = require('path');
const { createHandoff, archiveHandoff, getHandoff } = require('./handoffs');

/**
 * @typedef {Object} LegacyHandoffEntry
 * @property {string} date
 * @property {string} title
 * @property {string} slug
 * @property {string} body
 */

/** @param {string} seed */
function slugPart(seed) {
  return (
    String(seed || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'handoff'
  );
}

/** @param {string} tail */
function cleanLead(tail) {
  return String(tail || '')
    .replace(/^\s*(?:-|–|—|â€”)\s*/, '')
    .trim();
}

/**
 * Parse the old single-file docs/llm-handoff.md convention into dated entries.
 * It intentionally ignores non-dated sections such as Open threads and Quick map.
 *
 * @param {string} content
 * @returns {LegacyHandoffEntry[]}
 */
function parseLegacyHandoff(content) {
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  /** @type {LegacyHandoffEntry[]} */
  const entries = [];
  /** @type {{ date: string, title: string, intro: string, lines: string[] } | null} */
  let current = null;

  function flush() {
    if (!current) return;
    const bodyParts = [current.intro, current.lines.join('\n').trim()].filter(Boolean);
    const body = bodyParts.join('\n\n').trim();
    entries.push({
      date: current.date,
      title: current.title,
      slug: `legacy-${current.date}-${slugPart(current.title)}`,
      body,
    });
    current = null;
  }

  for (const line of lines) {
    const match = line.match(/^\*\*(\d{4}-\d{2}-\d{2})(?:\s+([^*]+))?\*\*\s*(.*)$/);
    if (match) {
      flush();
      const date = match[1] || '';
      const title = cleanLead(match[2] || 'Legacy handoff');
      current = {
        date,
        title,
        intro: cleanLead(match[3] || ''),
        lines: [],
      };
      continue;
    }
    if (current && /^##\s+/.test(line)) {
      flush();
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return entries.filter((entry) => entry.date && entry.title);
}

/**
 * Import legacy dated handoff blocks into managed handoff files. The newest
 * `keepActive` entries stay active; older entries are immediately archived.
 * Re-running is idempotent for generated legacy slugs.
 *
 * @param {{ sourceFile: string, repo?: string, keepActive?: number }} input
 * @returns {{ ok: true, imported: number, skipped: number, active: number, archived: number, entries: LegacyHandoffEntry[] } | { ok: false, error: string }}
 */
function migrateLegacyHandoff(input) {
  const sourceFile = String(input?.sourceFile || '').trim();
  if (!sourceFile) return { ok: false, error: 'sourceFile is required' };
  let content;
  try {
    content = fs.readFileSync(sourceFile, 'utf8');
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const repo = input?.repo ? String(input.repo) : path.dirname(sourceFile);
  const keepActive = Math.max(0, Number(input?.keepActive ?? 1) || 0);
  const entries = parseLegacyHandoff(content);
  let imported = 0;
  let skipped = 0;
  let active = 0;
  let archived = 0;

  entries.forEach((entry, index) => {
    if (getHandoff(entry.slug)) {
      skipped++;
      return;
    }
    const result = createHandoff({
      title: entry.title,
      repo,
      thread_tag: entry.slug,
      body: entry.body,
    });
    if (!result.ok) {
      skipped++;
      return;
    }
    imported++;
    if (index < keepActive) {
      active++;
      return;
    }
    const archiveResult = archiveHandoff(result.handoff.slug);
    if (archiveResult.ok) archived++;
  });

  return { ok: true, imported, skipped, active, archived, entries };
}

module.exports = { parseLegacyHandoff, migrateLegacyHandoff };
