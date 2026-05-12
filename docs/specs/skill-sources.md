# Skill Sources — Spec

> Status: ready for sign-off. 2026-05-11. Tracker: [TODO.md → P1: Skill sources](../../TODO.md). Related: [onboarding-redesign.md](onboarding-redesign.md).

## Problem

CE assumes skills live in a single root (`<CE_ROOT>/skills`). New users who have already built up a skills library somewhere else — most commonly inside a host app's own skill directory (Claude Code's `~/.claude/skills`, Cline's `.clinerules`, Continue's `.continue/rules`) — have no way to bring those into CE without manually copying files or moving the whole CE root.

That makes CE's onboarding feel hostile to established users. The Context step says "112 skills found" only because the user pointed CE at a directory that already had them; an empty CE install lands at 0 and gives the user no obvious next step.

## Goals

1. Detect host-app skill directories on the user's machine during onboarding.
2. Let the user **link** any external directory as a read-only skill source (cheap, non-destructive).
3. Let the user **import** a one-time copy of an external directory into CE's writable tree (heavier, but skills become first-class CE skills after).
4. Surface a unified skill count across CE's own dir + linked sources, in onboarding and in the Skills tab.
5. Keep the existing `<CE_ROOT>/skills` workflow unchanged for users who don't need external sources.

## Non-goals

- Multi-root vector indexing reactivity in this phase. The vector index keeps the unified skill set as its input; it just rebuilds on demand, not on external-dir watch events.
- Native folder picker via Electron IPC in this phase. Path entry is a text input + paste; the native picker is Phase 2.
- Two-way sync. Linked sources are read-only; CE never writes to them.

## Concepts

### Skill source

A registered external directory CE reads `SKILL.md` files from. Stored in `data/skill-sources.json`:

```json
{
  "sources": [
    {
      "id": "claude-global",
      "label": "Claude Code (global)",
      "path": "/home/jeremy/.claude/skills",
      "type": "external",
      "writable": false,
      "added": "2026-05-11T14:23:00Z",
      "lastSeen": "2026-05-11T14:23:00Z"
    }
  ]
}
```

`id` is stable; `path` may be absent at scan time (source removed from disk) — UI flags as missing rather than crashing.

### Source types

- `internal` — implicit, always exists, points at `SKILLS_DIR`. Never stored in `skill-sources.json`; treated as the first source in the merged list.
- `external` — user-linked directory, read-only.
- `imported` — copied into `<CE_ROOT>/skills/imported/<source-name>/` (Phase 2). Once imported, skills are physically part of CE's tree; the source entry is informational only (records origin).

## Backend

### New module: `server/lib/skill-sources.js`

- `listSources()` → reads `data/skill-sources.json`, returns array (always with the implicit `internal` source prepended).
- `addSource({ path, label })` → validates path exists, is a directory, contains at least one `SKILL.md` somewhere in its tree. Returns the new source record.
- `removeSource(id)` → deletes by id. Refuses if id is `internal`.
- `scanHostSkillPaths()` → probes known locations, returns `{ path, label, exists, skillCount }[]`. Probed paths:

  | Path                                  | Label                       |
  | ------------------------------------- | --------------------------- |
  | `~/.claude/skills`                    | Claude Code (global)        |
  | `<CWD>/.claude/skills`                | Claude Code (current project)|
  | `<CWD>/.clinerules`                   | Cline / Roo rules           |
  | `<CWD>/.continue/rules`               | Continue.dev rules          |
  | `~/.opencode/skills`                  | OpenCode (global)           |

  Each entry returns the resolved absolute path, a friendly label, `exists` boolean, and skill count if any.

### Modified module: `server/lib/skills.js`

`findSkillDirs(SKILLS_DIR)` is the single-root walker today. Change to:

```js
function findAllSkillDirs() {
  const sources = listSources(); // includes implicit internal
  return sources.flatMap((source) => {
    const skills = findSkillDirs(source.path);
    return skills.map((s) => ({ ...s, sourceId: source.id, sourceLabel: source.label }));
  });
}
```

All callers that iterate skills (`compile`, `index`, etc.) switch from `findSkillDirs(SKILLS_DIR)` to `findAllSkillDirs()`. The per-skill `sourceId` lets the UI badge each skill with its origin.

### Security guardrail

Reuse the existing write-path denylist from `server/lib/security.js`. External source paths must:

- Not start with system dirs (`/etc`, `C:\Windows`, etc.) — already in the denylist.
- Not target `.ssh`, `.aws`, `.gnupg`, browser profile dirs.
- Resolve to a real directory at registration time (best-effort; later disappearance is tolerated).

The denylist is reused but **inverted** for this case: we're reading, not writing, so the restriction is to prevent registering hostile paths that could be used to exfiltrate file contents through future export flows. Keep it strict.

### New endpoints

| Method | Path                          | Description                                                                    |
| ------ | ----------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/skill-sources`          | List registered sources + implicit internal. Returns skill counts per source.  |
| POST   | `/api/skill-sources`          | Add an external source. Body: `{ path, label? }`. Validates + denylist-checks. |
| DELETE | `/api/skill-sources/:id`      | Remove a source. Refuses on `internal`.                                        |
| GET    | `/api/skill-sources/scan`     | Probe known host-skill paths. Returns the candidates with counts.              |
| POST   | `/api/skill-sources/import`   | Phase 2 — copy a source's contents into `<CE_ROOT>/skills/imported/<id>/`.     |

## UI

### Onboarding step 2 (Context)

Add a sub-section under the stat grid:

```
Bring in existing skills

[detected source row]  Claude Code (global) — 12 skills at ~/.claude/skills        [Link]
[detected source row]  Cline / Roo rules    — 3 skills at .clinerules              [Link]

— or —

Path to skills folder: [ text input ............................ ]  [ Link ]
```

Linked sources move down into a "Linked" section once added:

```
Linked sources

[linked source row]  Claude Code (global) — 12 skills · Linked just now            [Unlink]
```

The stat grid above the sub-section recomputes after each link/unlink so "Skills found" reflects the unified total.

### Skills tab (Phase 2)

A new "Sources" affordance in the Skills tab header — a small select/expander that lets the user manage external sources and trigger imports. Out of scope for Phase 1.

## Migration

- First launch after upgrade: `skill-sources.json` doesn't exist. `listSources()` returns just the implicit `internal` source. No data migration needed.
- Existing onboarding completion: doesn't reset. Users who already finished onboarding don't see this UI unless they manually re-open onboarding — fine; this is a "new user" feature primarily.

## Accept criteria

- `GET /api/skill-sources/scan` returns the four probe paths with `exists` + `skillCount` where applicable, in <1s.
- `POST /api/skill-sources` rejects denylisted paths with a 400 and a clear error.
- Adding a source updates `findAllSkillDirs()` → `/api/skills` reflects new skills immediately (no restart).
- Onboarding step 2 shows detected sources, allows Link from each row, and shows the linked count updating.
- Removing a source unhooks its skills from the index without errors.
- `npm run typecheck`, `lint`, `lint:css`, `smoke` stay green. New smoke tests: a source-add roundtrip and a scan against a temp fixture dir.

## Resolved decisions (2026-05-11)

1. **Detected sources require an explicit Link click.** No auto-link. Listing a path is not the same as reading from it; users should validate before CE walks their home directory. The detected-source row shows path + skill count + a Link button; nothing happens until clicked.
2. **No filesystem-wide scan.** Detection only probes the known paths in the table above (`~/.claude/skills`, `~/.opencode/skills`, plus per-registered-workspace `.claude/skills` / `.clinerules` / `.continue/rules`). When detection finds nothing, the **text-input picker is the catch-all** — users paste any path they want and click Link. We never scan the whole disk looking for `SKILL.md` files.
3. **Project root source = `data/workspaces.json`.** Project-level probes iterate every registered workspace. CWD-based probing is dropped; it's misleading when CWD is the CE install dir.
4. **Phase 2 Import uses hard-link + diff detection.** Walk source files and create file-level hard links inside `<CE_ROOT>/skills/imported/<id>/`. Hard-link keeps content in sync automatically (same inode), so the user gets disk savings without a stale-copy problem. **On subsequent imports**, CE diffs at the directory-structure level (files added in source, files removed in source) and prompts the user to **Append** (only add new files, don't touch removed/changed) or **Overwrite** (mirror full source state, including deletions). Fallback to copy when hard-link fails — cross-volume on Windows, FAT filesystems, permission errors. Mode (link vs copy) is recorded per-source so re-syncs use the same strategy.
5. **Skill id collision handling deferred to Phase 2.** Phase 1 dedupes by id with first-source-wins semantics (internal takes precedence, then linked sources in registration order). If collisions become a real issue in practice we'll add the `<sourceId>:<skillId>` prefix scheme in Phase 2. Keeping bare ids in Phase 1 means `data/skill-states.json` doesn't need migration.

## Open questions

(None remaining for Phase 1 — proceed to implementation.)

## Phase 2 detailed design (2026-05-11)

Locked decisions:
- **Import action lives on the linked row.** Link is the cheap commitment, Import is the heavier one; forcing Link-then-Import is the right progression. No Import button on candidate rows.
- **Manual Sync only.** No filesystem watching; a Sync button on imported rows triggers the diff. Keeps the user in control of when CE walks their dirs.

### Source lifecycle (extended)

Three states for a registered source: `external` (linked, read from original), `imported` (linked + a copy/hard-link tree has been written into `<CE_ROOT>/skills/imported/<sourceId>/`), `internal` (implicit, never stored).

Transitions:
```
external --[POST /api/skill-sources/:id/import]--> imported
imported --[POST /api/skill-sources/:id/sync/apply]--> imported (manifest rewritten)
imported --[DELETE /api/skill-sources/:id]--> removed (imported dir kept, orphaned)
external --[DELETE /api/skill-sources/:id]--> removed (no on-disk artefact to clean up)
```

Unlinking an imported source intentionally **keeps** the imported tree. The user has accepted those skills into CE; tearing them down on unlink would surprise. Orphaned imported dir continues to be walked by the implicit internal source — skills remain visible, sourceLabel unset.

### Import strategy: hard-link + copy fallback

File-level `fs.linkSync` is the primary strategy. Fall back to `fs.copyFileSync` per-file on:
- `EXDEV` — cross-volume on Windows. NTFS hard-links are intra-volume only.
- `EPERM` / `EACCES` — source permissions.
- Non-link-capable filesystems (FAT/exFAT).

Strategy is recorded **per file** in the manifest because a single import can mix strategies in edge cases. Aggregate per source: `link`, `copy`, or `mixed`.

### Manifest shape

One file per imported source at `data/skill-imports/<sourceId>.json`:

```json
{
  "sourceId": "user-claude",
  "sourcePath": "/home/jeremy/.claude/skills",
  "destPath": "<CE_ROOT>/skills/imported/user-claude",
  "importedAt": "2026-05-11T15:00:00Z",
  "lastSyncedAt": "2026-05-11T15:00:00Z",
  "aggregateStrategy": "link",
  "files": [
    { "rel": "react/SKILL.md", "size": 2341, "mtimeMs": 1715000000000, "strategy": "link" }
  ]
}
```

`size` + `mtimeMs` are the change signal. No content hashing — it's overkill for SKILL.md files at this scale.

### Sync diff

`GET /api/skill-sources/:id/sync` walks the source and compares against the manifest. Returns:

```json
{
  "added":    [{ "rel": "...", "size": ..., "mtimeMs": ... }],
  "removed":  [{ "rel": "..." }],
  "modified": [{ "rel": "...", "size": ..., "mtimeMs": ... }]
}
```

Definitions:
- **Added**: in source, absent from manifest.
- **Removed**: in manifest, absent from source.
- **Modified**: in both, but `size` or `mtimeMs` differs **and** the per-file strategy is `copy`. Hard-linked files can't drift in content (shared inode), so we don't list them as modified even if mtime moved on the source.

`POST /api/skill-sources/:id/sync/apply` body `{ mode: 'append' | 'overwrite' }`:
- `append`: adds new files only. Removed and modified are left.
- `overwrite`: applies all three categories — add new, delete removed, re-link/re-copy modified.

Manifest is rewritten after successful apply.

### Endpoints (Phase 2)

| Method | Path                                            | Description                                                                |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/skill-sources/:id/import`                 | Walk source + write imported tree + manifest. Idempotent: refuses if already imported. |
| GET    | `/api/skill-sources/:id/sync`                   | Compute diff without applying.                                             |
| POST   | `/api/skill-sources/:id/sync/apply`             | Body `{ mode }`. Apply diff + rewrite manifest.                            |

### UI placement (Phase 2)

**Onboarding step 2 — inline progression on the linked row.** A linked row gains an "Import" affordance next to Unlink. Clicking expands the row to show the import target path + Confirm. After import, the row shows last-synced timestamp + a "Check for changes" action. That action expands to show the diff and Append / Overwrite / Cancel buttons.

**Skills tab "Sources" panel (2B).** Mirrors the same lifecycle outside onboarding. Add, link, import, sync, unlink. Reuses the same DS helpers and endpoints.

### Electron folder picker (2C)

`electron/main.cjs`: register `ipcMain.handle('select-folder', ...)` that calls `dialog.showOpenDialog` with `properties: ['openDirectory']`. Returns the picked path or `null` on cancel.

`electron/preload.cjs`: expose `selectFolder()` on the `contextEngineDesktop` bridge.

`ui/onboarding.js`: when `contextEngineDesktop?.runtime === 'electron'`, render a "Browse…" button alongside the text input. Browse → calls `selectFolder` → on resolve, fills the input + auto-submits. Text input remains visible in both modes as the catch-all.

### Index reactivity (2D)

Vector index doesn't auto-rebuild on source mutation — that would be a 15-60s blocking operation users wouldn't expect. Instead, flag the index as stale and surface a CTA.

- `data/index-status.json` adds a `stale` boolean (already exists for the index — extend the schema).
- `vectorstore.js` exports `markIndexStale()` and reflects the flag in `/api/index/status`.
- Skill-source mutation endpoints call `markIndexStale()` after invalidating the skill cache.
- Index rebuild clears the flag.
- UI: dashboard's Vector Index panel + onboarding step 2's Vector Index stat card both look at the staleness flag. When stale, show a small "Rebuild needed" badge + a Rebuild button that triggers the existing `DS.indexSkills()` flow.

### Acceptance criteria — Phase 2

- Import on a Link produces a manifest, copies/hard-links every SKILL.md and its siblings, returns aggregate strategy. Hard-linkable files are verified by inode equality on POSIX (in tests).
- Sync without changes returns empty diff arrays. After `mtime` bump on a copied file → file appears in `modified`. After adding a new SKILL.md in source → appears in `added`. After removing a SKILL.md in source → appears in `removed`.
- `append` adds only new files; `overwrite` mirrors source exactly. Manifest reflects the new state after either.
- Imported tree survives unlinking. After unlink the dir still has its skills walked by the internal source; `sourceLabel` is absent.
- Windows cross-volume: importing from `D:\` while CE is on `C:\` falls back to copy without errors.
- Electron picker: `Browse…` opens native dialog in Electron, hidden or fallback in browser.
- Index-stale banner appears after any source mutation, clears after rebuild.

### Open considerations (Phase 2)

- **Concurrency lock during import** — process-memory mutex per sourceId is enough. Don't use lock files (stale-lock recovery is a tax we don't need). Resolved by `withMutex()` in `skill-import.js`.
- **Source path moved/deleted between import and sync** — sync returns a clear error and leaves the imported tree intact. Don't auto-unlink (destructive). Resolved — `computeSyncDiff` returns `"Source path no longer exists on this machine"` when the source has disappeared.
- **User edits an imported SKILL.md directly in CE** — resolved (see below).

## Phase 2 follow-ups (2026-05-12)

### Skill-id collision handling — resolved

Phase 1 used first-source-wins, which silently hid external skills whose folder name collided with an internal skill. Now resolved by ID prefixing for external sources only.

- Internal source's skills keep bare ids (`react`, `python-debug`). `data/skill-states.json` and `data/modes.json` need no migration.
- External source's skills are stored under `<sourceId>:<bareId>` (e.g., `claude-global:react`). Both the internal and external versions of the same bare skill are visible in `/api/skills`.
- Per-skill record carries `id` (prefixed for external), `bareId` (the folder name), `name` (frontmatter or bare id), and `sourceId` / `sourceLabel`. UI uses `name` for display so collision-pair entries don't render two `srcA:react`/`internal:react` rows.
- Vector index records use the prefixed id as their `skillId`, so dedup/ranking/search all key consistently.
- Existing skill-states.json keys for non-collision external skills from Phase 1 (rare — feature only just shipped) become orphaned after this change. Toggling those skills active again rewrites them under the prefixed key. Migration is not performed because the surface area is near-zero in practice and a graceful read-side fallback would carry permanent debt.

Verification (direct node script): linking a fixture with both an `app-launcher` SKILL.md (collides with CE's internal `app-launcher`) and a `totally-new-skill` SKILL.md confirms both internal `app-launcher` and external `<id>:app-launcher` appear in `scanSkills()` simultaneously.

### Local edits in the imported tree — resolved

`computeSyncDiff` now detects when a file inside `<CE_ROOT>/skills/imported/<id>/` has drifted from the manifest's recorded size+mtime (only meaningful for `copy`-strategy files — hard-linked files share an inode so they can't drift independently). The diff response gains two new arrays:

- `localEdits`: dest diverged from manifest, source unchanged. Overwrite reverts to source.
- `conflicts`: dest AND source both diverged. Overwrite discards the local edit.

Apply behaviour:
- `append` ignores both.
- `overwrite` re-places `modified` + `localEdits` + `conflicts` (excluding conflicts whose source file no longer exists; those flow through `removed`).

UI (both onboarding step 2 and the Connections-tab Sources panel) renders the two new groups with warn/err coloured labels and adds a clobber-count warning band above the action buttons. The Overwrite button label switches to "Overwrite (discards N local edits)" when conflicts or local edits exist.

Verification (direct node script): import → manually mark a file as `copy` strategy in the manifest → edit the dest file → diff classifies it as `localEdits`; subsequently edit the source file → diff classifies the same entry as `conflicts`; overwrite apply re-places the file with source content, discarding the local edit.
