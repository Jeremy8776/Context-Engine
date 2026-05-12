// skill-import.js — hard-link import + diff/sync for external skill sources.
//
// Hard-link is the primary strategy. Per-file fallback to copy when linkSync
// throws (EXDEV cross-volume on Windows, EPERM/EACCES, FAT filesystems).
// Strategy is recorded per-file in a manifest at
//   data/skill-imports/<sourceId>.json
// so subsequent syncs know which files can drift in content (copies) vs
// which can't (links — shared inode).
//
// Spec: docs/specs/skill-sources.md → Phase 2 detailed design.

// @ts-check

const fs = require('fs');
const path = require('path');
const { DATA_DIR, SKILLS_DIR } = require('./config');
const { getSource } = require('./skill-sources');

const IMPORTS_DIR = path.join(DATA_DIR, 'skill-imports');
const IMPORTED_TREE = path.join(SKILLS_DIR, 'imported');

/**
 * @typedef {Object} ImportFileEntry
 * @property {string} rel       Forward-slash relative path under the source root.
 * @property {number} size
 * @property {number} mtimeMs
 * @property {'link' | 'copy'} strategy
 */

/**
 * @typedef {Object} ImportManifest
 * @property {string} sourceId
 * @property {string} sourcePath
 * @property {string} destPath
 * @property {string} importedAt
 * @property {string} lastSyncedAt
 * @property {'link' | 'copy' | 'mixed'} aggregateStrategy
 * @property {ImportFileEntry[]} files
 */

// Concurrency: at most one import/sync per sourceId in-flight at a time.
// Process-memory map; resets on server restart (safe — partial imports are
// detectable by manifest absence + destPath existence).
/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

/** @param {string} sourceId */
function manifestPath(sourceId) {
  return path.join(IMPORTS_DIR, `${sourceId}.json`);
}

/** @param {string} sourceId */
function destPathFor(sourceId) {
  return path.join(IMPORTED_TREE, sourceId);
}

/**
 * Read the manifest for a source.
 * @param {string} sourceId
 * @returns {ImportManifest | null}
 */
function readManifest(sourceId) {
  try {
    const raw = fs.readFileSync(manifestPath(sourceId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {ImportManifest} manifest */
function writeManifest(manifest) {
  if (!fs.existsSync(IMPORTS_DIR)) fs.mkdirSync(IMPORTS_DIR, { recursive: true });
  fs.writeFileSync(manifestPath(manifest.sourceId), JSON.stringify(manifest, null, 2), 'utf8');
}

/** @param {string} sourceId */
function deleteManifest(sourceId) {
  try {
    fs.unlinkSync(manifestPath(sourceId));
  } catch {
    /* not present — fine */
  }
}

/**
 * Walk a directory recursively and return every file as a relative path with
 * stat info. Tolerant of unreadable dirs.
 *
 * @param {string} root
 * @returns {Array<{ rel: string, abs: string, size: number, mtimeMs: number }>}
 */
function walkFiles(root) {
  /** @type {Array<{ rel: string, abs: string, size: number, mtimeMs: number }>} */
  const out = [];

  /** @param {string} dir */
  const walk = (dir) => {
    let items;
    try {
      items = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const abs = path.join(dir, item);
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(abs);
      } else if (stat.isFile()) {
        const rel = path.relative(root, abs).replace(/\\/g, '/');
        out.push({ rel, abs, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  };

  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Hard-link or copy one source file into the destination tree. Creates parent
 * dirs as needed. Returns the strategy that actually succeeded.
 *
 * @param {string} src
 * @param {string} dest
 * @returns {'link' | 'copy'}
 */
function placeFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.linkSync(src, dest);
    return 'link';
  } catch (err) {
    const code = err && typeof err === 'object' ? /** @type {any} */ (err).code : null;
    // EEXIST on the link target — remove and retry as link.
    if (code === 'EEXIST') {
      try {
        fs.unlinkSync(dest);
        fs.linkSync(src, dest);
        return 'link';
      } catch {
        /* fall through to copy */
      }
    }
    // Cross-volume, permission, non-link-capable filesystem — copy instead.
    fs.copyFileSync(src, dest);
    return 'copy';
  }
}

/**
 * Compute the per-source aggregate strategy from a list of file entries.
 * @param {ImportFileEntry[]} files
 * @returns {'link' | 'copy' | 'mixed'}
 */
function aggregateStrategyOf(files) {
  let sawLink = false;
  let sawCopy = false;
  for (const f of files) {
    if (f.strategy === 'link') sawLink = true;
    else if (f.strategy === 'copy') sawCopy = true;
    if (sawLink && sawCopy) return 'mixed';
  }
  if (sawLink) return 'link';
  if (sawCopy) return 'copy';
  return 'link';
}

/**
 * Acquire the in-flight slot for a source. Subsequent callers wait until the
 * existing operation completes.
 *
 * @template T
 * @param {string} sourceId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withMutex(sourceId, fn) {
  const prior = inFlight.get(sourceId);
  if (prior) {
    try {
      await prior;
    } catch {
      /* ignore — we run our own attempt next */
    }
  }
  const promise = (async () => fn())();
  inFlight.set(sourceId, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(sourceId) === promise) inFlight.delete(sourceId);
  }
}

/**
 * Import a source: place every file from its tree into <CE_ROOT>/skills/
 * imported/<sourceId>/ using hard-link with copy fallback. Writes the
 * manifest atop.
 *
 * Idempotent: refuses if a manifest already exists for this source. Use
 * sync/apply instead to update an existing import.
 *
 * @param {string} sourceId
 * @returns {Promise<{ ok: true, manifest: ImportManifest } | { ok: false, error: string }>}
 */
async function importSource(sourceId) {
  return withMutex(sourceId, async () => {
    const source = getSource(sourceId);
    if (!source) return { ok: false, error: 'Source not found' };
    if (source.type === 'internal') return { ok: false, error: 'Cannot import the internal source' };

    if (readManifest(sourceId)) {
      return { ok: false, error: 'Source is already imported. Use sync to refresh.' };
    }

    let stat;
    try {
      stat = fs.statSync(source.path);
    } catch {
      return { ok: false, error: 'Source path no longer exists on this machine' };
    }
    if (!stat.isDirectory()) return { ok: false, error: 'Source path is not a directory' };

    const dest = destPathFor(sourceId);
    if (fs.existsSync(dest)) {
      // Stale leftover from a previous failed import — clean it up.
      try {
        fs.rmSync(dest, { recursive: true, force: true });
      } catch (err) {
        return {
          ok: false,
          error: `Could not clear stale import destination: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
    fs.mkdirSync(dest, { recursive: true });

    const files = walkFiles(source.path);

    /** @type {ImportFileEntry[]} */
    const placed = [];
    for (const file of files) {
      const target = path.join(dest, file.rel);
      let strategy;
      try {
        strategy = placeFile(file.abs, target);
      } catch (err) {
        return {
          ok: false,
          error: `Could not place ${file.rel}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      placed.push({ rel: file.rel, size: file.size, mtimeMs: file.mtimeMs, strategy });
    }

    const now = new Date().toISOString();
    /** @type {ImportManifest} */
    const manifest = {
      sourceId,
      sourcePath: source.path,
      destPath: dest,
      importedAt: now,
      lastSyncedAt: now,
      aggregateStrategy: aggregateStrategyOf(placed),
      files: placed,
    };
    writeManifest(manifest);

    return { ok: true, manifest };
  });
}

/**
 * Compute the diff between the source's current state and the manifest.
 * Read-only — does not touch the imported tree.
 *
 * @param {string} sourceId
 * @returns {{ ok: true, diff: { added: ImportFileEntry[], removed: Array<{rel: string}>, modified: ImportFileEntry[] }, manifest: ImportManifest } | { ok: false, error: string }}
 */
function computeSyncDiff(sourceId) {
  const manifest = readManifest(sourceId);
  if (!manifest) return { ok: false, error: 'Source is not imported. Run Import first.' };

  let stat;
  try {
    stat = fs.statSync(manifest.sourcePath);
  } catch {
    return { ok: false, error: 'Source path no longer exists on this machine' };
  }
  if (!stat.isDirectory()) return { ok: false, error: 'Source path is not a directory' };

  const current = walkFiles(manifest.sourcePath);
  /** @type {Map<string, { rel: string, size: number, mtimeMs: number }>} */
  const currentByRel = new Map(current.map((f) => [f.rel, f]));

  /** @type {Map<string, ImportFileEntry>} */
  const manifestByRel = new Map(manifest.files.map((f) => [f.rel, f]));

  /** @type {ImportFileEntry[]} */
  const added = [];
  /** @type {Array<{ rel: string }>} */
  const removed = [];
  /** @type {ImportFileEntry[]} */
  const modified = [];

  for (const [rel, cur] of currentByRel.entries()) {
    const prev = manifestByRel.get(rel);
    if (!prev) {
      added.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'link' });
      continue;
    }
    // Hard-linked files share an inode with the source so they can't drift
    // in content. Only flag modified for copy-strategy entries.
    if (prev.strategy === 'copy' && (prev.size !== cur.size || prev.mtimeMs !== cur.mtimeMs)) {
      modified.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'copy' });
    }
  }

  for (const rel of manifestByRel.keys()) {
    if (!currentByRel.has(rel)) removed.push({ rel });
  }

  return { ok: true, diff: { added, removed, modified }, manifest };
}

/**
 * Apply a sync diff. `mode='append'` adds new files only; `mode='overwrite'`
 * mirrors source state (add new, delete removed, re-place modified).
 *
 * @param {string} sourceId
 * @param {'append' | 'overwrite'} mode
 * @returns {Promise<{ ok: true, applied: { added: number, removed: number, modified: number }, manifest: ImportManifest } | { ok: false, error: string }>}
 */
async function applySyncDiff(sourceId, mode) {
  return withMutex(sourceId, async () => {
    if (mode !== 'append' && mode !== 'overwrite') {
      return { ok: false, error: "mode must be 'append' or 'overwrite'" };
    }

    const diffResult = computeSyncDiff(sourceId);
    if (!diffResult.ok) return diffResult;

    const { diff, manifest } = diffResult;
    const dest = manifest.destPath;
    const sourcePath = manifest.sourcePath;

    // Re-stat source — defensive, in case it moved between diff and apply.
    try {
      if (!fs.statSync(sourcePath).isDirectory()) {
        return { ok: false, error: 'Source path is not a directory' };
      }
    } catch {
      return { ok: false, error: 'Source path no longer exists on this machine' };
    }

    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;

    // Update manifest file list as we go. Start from existing files and mutate
    // per the operations applied.
    /** @type {Map<string, ImportFileEntry>} */
    const fileMap = new Map(manifest.files.map((f) => [f.rel, f]));

    // 1. Add new files.
    for (const entry of diff.added) {
      const src = path.join(sourcePath, entry.rel);
      const tgt = path.join(dest, entry.rel);
      let strategy;
      try {
        strategy = placeFile(src, tgt);
      } catch (err) {
        return {
          ok: false,
          error: `Could not place ${entry.rel}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      const stat = fs.statSync(src);
      fileMap.set(entry.rel, {
        rel: entry.rel,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        strategy,
      });
      addedCount++;
    }

    if (mode === 'overwrite') {
      // 2. Remove deleted files.
      for (const entry of diff.removed) {
        const tgt = path.join(dest, entry.rel);
        try {
          fs.unlinkSync(tgt);
        } catch {
          /* tolerant — already gone is fine */
        }
        fileMap.delete(entry.rel);
        removedCount++;
      }

      // 3. Re-place modified files. Drop the old link/copy first; the new one
      //    may use a different strategy if conditions changed.
      for (const entry of diff.modified) {
        const src = path.join(sourcePath, entry.rel);
        const tgt = path.join(dest, entry.rel);
        try {
          fs.unlinkSync(tgt);
        } catch {
          /* tolerant */
        }
        let strategy;
        try {
          strategy = placeFile(src, tgt);
        } catch (err) {
          return {
            ok: false,
            error: `Could not re-place ${entry.rel}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        const stat = fs.statSync(src);
        fileMap.set(entry.rel, {
          rel: entry.rel,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          strategy,
        });
        modifiedCount++;
      }
    }

    const files = Array.from(fileMap.values()).sort((a, b) => a.rel.localeCompare(b.rel));
    /** @type {ImportManifest} */
    const updated = {
      ...manifest,
      lastSyncedAt: new Date().toISOString(),
      aggregateStrategy: aggregateStrategyOf(files),
      files,
    };
    writeManifest(updated);

    return {
      ok: true,
      applied: { added: addedCount, removed: removedCount, modified: modifiedCount },
      manifest: updated,
    };
  });
}

/**
 * Delete the manifest for a source (called when the source is removed). Does
 * not touch the imported tree — the user's choice to import implies they want
 * to keep the files.
 *
 * @param {string} sourceId
 */
function forgetImport(sourceId) {
  deleteManifest(sourceId);
}

module.exports = {
  importSource,
  computeSyncDiff,
  applySyncDiff,
  readManifest,
  forgetImport,
};
