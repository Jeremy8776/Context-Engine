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

// Concurrency: at most one mutating operation per sourceId at a time. The
// mutex is shared with skill-sources.js's removeSource so an unlink racing
// an in-flight import won't leave an orphan tree at skills/imported/<id>/.
// Process-memory only; resets on server restart (safe — partial imports are
// detectable by manifest absence + destPath existence).
const { createKeyMutex } = require('./per-key-mutex');
const sourceMutex = createKeyMutex();

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

/** Cap traversal to bound DoS via huge trees / infinite loops. */
const WALK_FILE_CAP = 10000;
const WALK_DEPTH_CAP = 12;

/**
 * Reject a relative path that escapes the walked root (`..` segments,
 * absolute path, drive letter). Used as a second-line check on the
 * `path.relative()` output before any `path.join(dest, rel)` operation.
 *
 * @param {string} rel
 */
function isRelPathSafe(rel) {
  if (!rel || typeof rel !== 'string') return false;
  if (path.isAbsolute(rel)) return false;
  // Reject drive-letter prefixes that path.isAbsolute misses on cross-platform paths.
  if (/^[a-zA-Z]:/.test(rel)) return false;
  const segments = rel.split(/[\\/]+/);
  return !segments.some((seg) => seg === '..' || seg === '');
}

/**
 * Join base + rel and assert the result stays strictly inside base. Returns
 * null when rel is unsafe or resolves outside base; caller decides whether
 * to skip the file or fail the whole operation. Always use this instead of
 * `path.join(base, rel)` when `rel` came from disk-walked or manifest data.
 *
 * @param {string} base
 * @param {string} rel
 */
function safeJoin(base, rel) {
  if (!isRelPathSafe(rel)) return null;
  const target = path.resolve(base, rel);
  const baseResolved = path.resolve(base);
  // Allow `target === baseResolved` (rel === '') only at the boundary; reject
  // anything that doesn't sit STRICTLY under base + separator.
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) return null;
  return target;
}

/**
 * Walk a directory recursively and return every file as a relative path with
 * stat info. Tolerant of unreadable dirs.
 *
 * Symlinks are detected via `fs.lstatSync` and **skipped** — they're the
 * primary import-tree escape vector. A "safe-looking" source dir with a
 * symlink to `C:\Windows\system.ini` would otherwise be followed by the
 * walk and hard-linked into the imported tree. Symlinked subdirs would
 * produce `rel` paths like `../../Windows/...` that downstream `path.join`
 * would happily place outside dest.
 *
 * @param {string} root
 * @returns {Array<{ rel: string, abs: string, size: number, mtimeMs: number }>}
 */
function walkFiles(root) {
  /** @type {Array<{ rel: string, abs: string, size: number, mtimeMs: number }>} */
  const out = [];
  let resolvedRoot;
  try {
    resolvedRoot = fs.realpathSync(root);
  } catch {
    return out;
  }

  /** @param {string} dir @param {number} depth */
  const walk = (dir, depth) => {
    if (depth > WALK_DEPTH_CAP) return;
    if (out.length >= WALK_FILE_CAP) return;
    let items;
    try {
      items = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      if (out.length >= WALK_FILE_CAP) return;
      const abs = path.join(dir, item);
      let lstat;
      try {
        lstat = fs.lstatSync(abs);
      } catch {
        continue;
      }
      // Skip every symlink — both file and directory. Following them
      // either escapes the root (containment violation) or hard-links
      // through to whatever the symlink points at (file disclosure).
      if (lstat.isSymbolicLink()) continue;
      if (lstat.isDirectory()) {
        walk(abs, depth + 1);
      } else if (lstat.isFile()) {
        const rel = path.relative(resolvedRoot, abs).replace(/\\/g, '/');
        // Defence in depth: a `..` should be impossible after the symlink
        // skip above, but bail anyway if anything produced a traversal.
        if (!isRelPathSafe(rel)) continue;
        out.push({ rel, abs, size: lstat.size, mtimeMs: lstat.mtimeMs });
      }
    }
  };

  walk(resolvedRoot, 0);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Errors where hard-link is genuinely not possible but copy will work.
// Anything else (ENOSPC disk full, EROFS read-only, EACCES auth, EIO) is
// a real failure and should propagate so the caller can surface it
// instead of silently masking with a copy that will also fail.
const LINK_FALLBACK_CODES = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP']);

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
    // Cross-volume / permission-blocked-for-link / non-link-capable filesystem.
    // Other errors (disk-full, IO, etc.) propagate; copy isn't going to help.
    if (!LINK_FALLBACK_CODES.has(code) && code !== 'EEXIST') throw err;
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
 * Acquire the in-flight slot for a source. Delegates to the shared per-key
 * mutex so cross-module callers (skill-sources.removeSource → forgetImport)
 * serialise against import/sync operations on the same id.
 *
 * @template T
 * @param {string} sourceId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withMutex(sourceId, fn) {
  return sourceMutex(sourceId, fn);
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
      const target = safeJoin(dest, file.rel);
      if (!target) {
        return { ok: false, error: `Refusing to place ${file.rel}: path escapes import directory` };
      }
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
 * Compute the diff between the source's current state and the manifest, also
 * detecting drift inside the imported tree (local edits applied to copied
 * files since import). Read-only — does not touch the imported tree.
 *
 * @param {string} sourceId
 * @returns {{ ok: true, diff: SyncDiff, manifest: ImportManifest } | { ok: false, error: string }}
 *
 * @typedef {Object} SyncDiff
 * @property {ImportFileEntry[]} added       New in source, not in manifest.
 * @property {Array<{rel: string}>} removed  In manifest, not in source.
 * @property {ImportFileEntry[]} modified    Source changed AND imported copy unchanged (safe to overwrite).
 * @property {ImportFileEntry[]} localEdits  Imported copy diverged from manifest, source unchanged (overwrite reverts to source).
 * @property {ImportFileEntry[]} conflicts   Both source AND imported copy diverged from manifest (overwrite discards local edits).
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
  /** @type {ImportFileEntry[]} */
  const localEdits = [];
  /** @type {ImportFileEntry[]} */
  const conflicts = [];

  // Pass 1: source-side iteration finds added + flags candidate-modified.
  for (const [rel, cur] of currentByRel.entries()) {
    const prev = manifestByRel.get(rel);
    if (!prev) {
      added.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'link' });
      continue;
    }
    // Hard-linked files share an inode with the source so they can't drift
    // in content independently. Source-side mtime changes also propagate to
    // the imported view automatically, so we don't flag those either.
    if (prev.strategy !== 'copy') continue;

    const sourceChanged = prev.size !== cur.size || prev.mtimeMs !== cur.mtimeMs;
    const localChanged = importedCopyDiverged(manifest, prev);

    if (sourceChanged && localChanged) {
      conflicts.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'copy' });
    } else if (sourceChanged) {
      modified.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'copy' });
    } else if (localChanged) {
      localEdits.push({ rel, size: cur.size, mtimeMs: cur.mtimeMs, strategy: 'copy' });
    }
  }

  // Pass 2: manifest-side iteration finds removed (in manifest, not in source).
  // Also catch a local edit on a file whose source has been deleted — overwrite
  // would remove that file from the imported tree, losing the local edit.
  for (const [rel, prev] of manifestByRel.entries()) {
    if (currentByRel.has(rel)) continue;
    removed.push({ rel });
    if (prev.strategy === 'copy' && importedCopyDiverged(manifest, prev)) {
      conflicts.push({ rel, size: prev.size, mtimeMs: prev.mtimeMs, strategy: 'copy' });
    }
  }

  return { ok: true, diff: { added, removed, modified, localEdits, conflicts }, manifest };
}

/**
 * Returns true if the imported copy of the given file diverges from the size
 * + mtime recorded in the manifest. Tolerant of missing files (treated as
 * diverged so the user is told the imported file is gone).
 *
 * @param {ImportManifest} manifest
 * @param {ImportFileEntry} entry
 */
function importedCopyDiverged(manifest, entry) {
  const target = safeJoin(manifest.destPath, entry.rel);
  if (!target) return true;
  let destStat;
  try {
    destStat = fs.lstatSync(target);
  } catch {
    return true;
  }
  // A dest entry that's become a symlink can't be trusted; flag as diverged
  // so overwrite re-places it from source (and breaks the symlink).
  if (destStat.isSymbolicLink()) return true;
  return destStat.size !== entry.size || destStat.mtimeMs !== entry.mtimeMs;
}

/**
 * @param {string} sourcePath
 * @param {string} rel
 * @returns {boolean} True when the source still has this file (so re-placement
 *   makes sense). Used to skip already-deleted source files in the conflict
 *   re-placement pass.
 */
function currentByRelForReplace(sourcePath, rel) {
  const target = safeJoin(sourcePath, rel);
  if (!target) return false;
  try {
    const lstat = fs.lstatSync(target);
    return lstat.isFile() && !lstat.isSymbolicLink();
  } catch {
    return false;
  }
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
      const src = safeJoin(sourcePath, entry.rel);
      const tgt = safeJoin(dest, entry.rel);
      if (!src || !tgt) {
        return { ok: false, error: `Refusing to place ${entry.rel}: path escapes import directory` };
      }
      let strategy;
      try {
        strategy = placeFile(src, tgt);
      } catch (err) {
        return {
          ok: false,
          error: `Could not place ${entry.rel}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      let stat;
      try {
        stat = fs.statSync(src);
      } catch {
        // Source file disappeared between diff and apply. Drop from manifest
        // rather than blowing up the whole operation.
        fileMap.delete(entry.rel);
        continue;
      }
      fileMap.set(entry.rel, {
        rel: entry.rel,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        strategy,
      });
      addedCount++;
    }

    if (mode === 'overwrite') {
      // 2. Remove deleted files. (Caller has been warned via the diff if any
      //    of these were locally edited — that case lives in `conflicts`.)
      for (const entry of diff.removed) {
        const tgt = safeJoin(dest, entry.rel);
        if (!tgt) continue;
        try {
          fs.unlinkSync(tgt);
        } catch {
          /* tolerant — already gone is fine */
        }
        fileMap.delete(entry.rel);
        removedCount++;
      }

      // 3. Re-place files where the dest needs to be reset to mirror the
      //    source. Three categories all flow through the same placement:
      //    `modified` (source changed, dest clean → safe),
      //    `conflicts` (source changed AND dest changed → discards local),
      //    `localEdits` (source clean, dest drifted → reverts to source).
      //    Skip conflicts whose source file has been deleted — they're
      //    already handled by the removed pass above.
      const toReplace = [
        ...diff.modified,
        ...diff.conflicts.filter((entry) => currentByRelForReplace(sourcePath, entry.rel)),
        ...diff.localEdits,
      ];
      for (const entry of toReplace) {
        const src = safeJoin(sourcePath, entry.rel);
        const tgt = safeJoin(dest, entry.rel);
        if (!src || !tgt) continue;
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
        let stat;
        try {
          stat = fs.statSync(src);
        } catch {
          fileMap.delete(entry.rel);
          continue;
        }
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
  /**
   * Exposed so skill-sources.removeSource can serialise unlinks against
   * in-flight import/sync operations on the same source id.
   */
  withSourceMutex: withMutex,
};
