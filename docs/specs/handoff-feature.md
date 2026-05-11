# Handoff Feature — Scope

> Status: scoping. Last updated 2026-05-11. Tracker: [TODO.md → P1: Handoffs](../../TODO.md).

## Problem

Context Engine has two persistence surfaces today: **Memory** (long-lived facts about Jeremy and the project) and **Tasks** (active work in TODO.md). Missing is the *thread state* in between — the "where were we" bookmark that lets a new session pick up an in-flight task without rereading the whole conversation.

The convention exists informally as [llm-handoff.md](../llm-handoff.md): a single living file that the next contributor reads first. It works, but it's:

- Manual to write and never auto-truncates — entries from weeks ago still load.
- Single-file: project handoffs and thread handoffs share one stream.
- Not exposed to host apps (Claude Desktop, Codex) via MCP, so daily AI surfaces can't pick up the thread.
- Not pruned against repo activity — a handoff stays "current" even after the underlying code has moved on.

## Goals

1. Formalise handoffs as a CE-managed surface, peer to Memory and Tasks.
2. Auto-archive stale handoffs using signals that match how staleness actually happens (commits move past, threads go cold).
3. Expose active handoffs to host apps via MCP so a fresh session in any daily AI surface can resume cleanly.
4. Preserve the existing llm-handoff.md content during migration.

## Non-goals

- Replacing Memory or Tasks. Handoffs are explicitly *between* them — short-lived state, not facts and not active work items.
- Auto-generating handoff text. The user writes the prose; CE manages the lifecycle.
- Cross-repo handoff merging. A handoff is bound to at most one repo.

## Types

### Project handoff

Bound to a repo working directory.

- **Created with**: working directory path, free-text body, optional `thread_tag`.
- **Records on write**: `head_sha` (current local HEAD), `created`, `last_touched`.
- **Tracks**: every local commit past `head_sha` increments a counter. On `git push`, records `pushed_sha` so we can distinguish "5 commits passed locally" from "5 commits passed and shipped."
- **Archive trigger**: 5+ local commits past `head_sha`. *Exception*: if the handoff carries a `thread_tag` and that thread has been touched in the last 14 days, the archive is deferred (thread wins — see Conflict Rule below).

### Thread handoff

Bound to a topic tag, not a repo. Covers CLI sessions and strategy threads where there is no repo to anchor against.

- **Created with**: `thread_tag` (slug), free-text body.
- **Records on write**: `created`, `last_touched`.
- **Archive trigger**: 14 days idle (no touch).

### Dual-bound handoff

A handoff can carry both a `repo` and a `thread_tag`. Both signals apply. See Conflict Rule.

## Conflict Rule

When a handoff has both bindings and the staleness signals disagree:

- 5+ local commits past *and* thread idle 14+ days → archive.
- 5+ local commits past, thread still active → **keep**. Commits are a proxy for "code moved on," but if the human is still working the thread, the handoff is still load-bearing.
- Thread idle 14+ days, commits under threshold → archive.

Archive only when *both* applicable signals trip.

## On-disk shape

Parallel to memory's `MEMORY.md` + `memory/*.md` layout.

```
app/docs/
  handoffs/
    HANDOFFS.md                    # index, one line per active handoff
    <slug>.md                      # active handoff body
    archive/
      <slug>.md                    # archived, kept 30 days then purged
```

Each handoff body:

```markdown
---
type: project | thread | dual
repo: E:\DataCert\Context Engine   # absent for pure thread handoffs
head_sha: a1b2c3d                  # absent for pure thread handoffs
pushed_sha: a1b2c3d                # absent until first push past head_sha
thread_tag: handoff-feature        # absent for pure project handoffs
created: 2026-05-11T14:00:00Z
last_touched: 2026-05-11T14:00:00Z
commits_past_head: 0
---

# <Title>

<free-text body — same prose style as today's llm-handoff.md entries>
```

`HANDOFFS.md` is the always-loaded index, capped at ~200 lines. One line per active handoff:

```
- [<slug>](<slug>.md) — <repo or thread_tag> · <age> · <commits_past_head> commits past head
```

## Lifecycle

| Event | Action |
|-------|--------|
| User writes handoff | New `<slug>.md` + index line. `head_sha` captured if repo bound. |
| Local commit on bound repo | `commits_past_head` increments for every active handoff with that repo. |
| `git push` on bound repo | Update `pushed_sha` to match `head_sha` of latest pushed commit. |
| User updates handoff body | `last_touched` updates. Counter does **not** reset (that's what archive-then-rewrite is for). |
| Archive trigger fires | Move body to `handoffs/archive/<slug>.md`, drop index line. |
| 30 days in archive | Delete archived file. |

## API surface

Server endpoints (additions to existing `server/router.js`):

- `GET /api/handoffs` — list active handoffs.
- `GET /api/handoffs/archive` — list archived (for UI browsing).
- `POST /api/handoffs` — create. Body: `{ type, repo?, thread_tag?, title, body }`.
- `PATCH /api/handoffs/:slug` — update body or touch.
- `POST /api/handoffs/:slug/archive` — manual archive.

MCP tool (additions to `mcp-tools.mjs`):

- `context_engine_handoffs(repo?, thread_tag?)` — returns active handoffs matching the filter, so a host app session can resume a thread.

## UI

A new "Handoffs" tab in the Electron admin panel, peer to Memory.

- Active handoffs list with title, binding, age, commit count.
- Click to view/edit body.
- Manual archive button.
- "Archived" sub-view with restore + purge-now actions.

## Background work

The archive trigger needs a periodic check. Options:

1. **On-demand**: evaluate stale handoffs when the index is loaded by API or MCP. Simple, no scheduler.
2. **Scheduled**: a small daily task. Heavier but predictable.

Recommendation: start with on-demand. Add scheduled only if handoffs grow into a surface that needs to be reliably current without traffic.

Local commits are detected by polling `git rev-list <head_sha>..HEAD --count` per repo when the handoff is loaded or listed. Cheap.

## Migration

Existing `app/docs/llm-handoff.md` has ~50 dated entries. Plan:

1. Parse each `**<date> <title>**` block into a separate `<slug>.md` body.
2. Tag every entry as a project handoff bound to the CE repo, with `head_sha` set to the closest commit to that date.
3. Run the archive sweep — most entries are older than the staleness threshold and will land in archive immediately, leaving only the most recent few active.
4. Keep `llm-handoff.md` as a redirect stub pointing at `handoffs/HANDOFFS.md`.

## Open questions

- Does the commit counter also include merge commits made by `git pull --rebase` etc., or only authored commits? Lean: count all commits that change HEAD, since the point is "code moved on."
- Should a handoff carry references to specific files (like the design Q3 from the convo earlier)? Punting for v1 — file-scoped staleness adds complexity that we don't need until repo-wide commits prove too noisy.
- Should thread handoffs sync somewhere outside the repo so they survive across machines? Out of scope for v1; covered by Memory if it matters.
