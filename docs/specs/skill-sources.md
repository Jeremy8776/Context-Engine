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
