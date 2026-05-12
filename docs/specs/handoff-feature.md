# Handoff Feature — Scope

> Status: v1 implemented. Last updated 2026-05-12. Tracker: [TODO.md → P1: Handoffs](../../TODO.md).

## Problem

Context Engine has two persistence surfaces today: **Memory** (long-lived facts about Jeremy and the project) and **Tasks** (active work in TODO.md). Missing is the _thread state_ in between — the "where were we" bookmark that lets a new session pick up an in-flight task without rereading the whole conversation.

The convention exists informally as [llm-handoff.md](../llm-handoff.md): a single living file that the next contributor reads first. It works, but it's:

- Manual to write and never auto-truncates — entries from weeks ago still load.
- Single-file: project handoffs and thread handoffs share one stream.
- Not exposed to host apps (Claude Desktop, Codex) via MCP, so daily AI surfaces can't pick up the thread.
- Not pruned against repo activity — a handoff stays "current" even after the underlying code has moved on.

## Goals

1. Formalise handoffs as a CE-managed surface, peer to Memory and Tasks.
2. Auto-archive stale handoffs using signals that match how staleness actually happens (commits move past, threads go cold).
3. Expose active handoffs to host apps via MCP so a fresh session in any daily AI surface can resume cleanly.
4. Show a bounded commit timeline for repo-bound handoffs so a new host can see how far the project moved since the handoff was written.
5. Preserve the existing llm-handoff.md content during migration.

## Non-goals

- Replacing Memory or Tasks. Handoffs are explicitly _between_ them — short-lived state, not facts and not active work items.
- Auto-generating handoff text. The user writes the prose; CE manages the lifecycle.
- Cross-repo handoff merging. A handoff is bound to at most one repo.

## Types

### Project handoff

Bound to a repo working directory.

- **Created with**: working directory path, free-text body, optional `thread_tag`.
- **Records on write**: `head_sha` (current local HEAD), `created`, `last_touched`.
- **Tracks**: every local commit past `head_sha` increments a counter. On `git push`, records `pushed_sha` so we can distinguish "5 commits passed locally" from "5 commits passed and shipped."
- **Archive trigger**: 5+ local commits past `head_sha`. _Exception_: if the handoff carries a `thread_tag` and that thread has been touched in the last 14 days, the archive is deferred (thread wins — see Conflict Rule below).

### Thread handoff

Bound to a topic tag, not a repo. Covers CLI sessions and strategy threads where there is no repo to anchor against.

- **Created with**: `thread_tag` (slug), free-text body.
- **Records on write**: `created`, `last_touched`.
- **Archive trigger**: 14 days idle (no touch).

### Dual-bound handoff

A handoff can carry both a `repo` and a `thread_tag`. Both signals apply. See Conflict Rule.

## Conflict Rule

When a handoff has both bindings and the staleness signals disagree:

- 5+ local commits past _and_ thread idle 14+ days → archive.
- 5+ local commits past, thread still active → **keep**. Commits are a proxy for "code moved on," but if the human is still working the thread, the handoff is still load-bearing.
- Thread idle 14+ days, commits under threshold → archive.

Archive dual-bound handoffs when the thread goes idle. Commit-only staleness is advisory while the thread is still active.

## On-disk shape

Runtime-managed files under the CE data root. The original scope described an `app/docs/handoffs/` index; v1 stores the managed surface in `data/handoffs/` so it follows runtime user data rather than app code.

```
data/
  handoffs/
    <slug>.md                      # active handoff body
    archive/
      <slug>.md                    # archived, kept 30 days then purged
```

`HANDOFFS.md` index generation is deferred; the app and MCP tool list active handoffs directly from the managed files.

Each handoff body:

```markdown
---
type: project | thread | dual
repo: E:\DataCert\Context Engine # absent for pure thread handoffs
head_sha: a1b2c3d # absent for pure thread handoffs
pushed_sha: a1b2c3d # absent until first push past head_sha
thread_tag: handoff-feature # absent for pure project handoffs
created: 2026-05-11T14:00:00Z
last_touched: 2026-05-11T14:00:00Z
---

# <Title>

<free-text body — same prose style as today's llm-handoff.md entries>
```

`HANDOFFS.md` is the always-loaded index, capped at ~200 lines. One line per active handoff:

```
- [<slug>](<slug>.md) — <repo or thread_tag> · <age> · <commits_past_head> commits past head
```

## Project file convention

For host/LLM workflows, the managed store should not require a human to paste body text into the admin UI. A host can write this file inside the project:

```text
<repo>/.context-engine/handoff.md
```

Optional frontmatter:

```markdown
---
title: Handoff feature checkpoint
thread_tag: handoff-feature
---

# Current state

What changed, what is incomplete, and where the next agent should start.

## Next

The next concrete actions.
```

CE then syncs that file through `POST /api/handoffs/sync-project` or the MCP tool `context_engine_sync_project_handoff(repo)`. First sync creates the managed handoff. Later syncs update the body and touch `last_touched`, but preserve the managed title so the UI remains human-owned.

## Lifecycle

| Event                      | Action                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| User writes handoff        | New `<slug>.md` + index line. `head_sha` captured if repo bound.                              |
| Host writes project file   | `.context-engine/handoff.md` can be synced into the managed store.                            |
| Local commit on bound repo | `commits_past_head` increments for every active handoff with that repo.                       |
| `git push` on bound repo   | Deferred for v1. `pushed_sha` is not tracked yet.                                             |
| User updates handoff body  | `last_touched` updates. Counter does **not** reset (that's what archive-then-rewrite is for). |
| Handoff detail opens       | Bounded `git log <head_sha>..HEAD` timeline is computed for repo-bound handoffs.              |
| Archive trigger fires      | Move body to `handoffs/archive/<slug>.md`, drop index line.                                   |
| 30 days in archive         | Delete archived file.                                                                         |

## API surface

Server endpoints (additions to existing `server/router.js`):

- `GET /api/handoffs` — list active handoffs.
- `GET /api/handoffs/archive` — list archived (for UI browsing).
- `POST /api/handoffs/sync-project` — sync `<repo>/.context-engine/handoff.md` into managed handoffs.
- `POST /api/handoffs` — create. Body: `{ type, repo?, thread_tag?, title, body }`.
- `PATCH /api/handoffs/:slug` — update body or touch.
- `POST /api/handoffs/:slug/archive` — manual archive.

MCP tool (additions to `mcp-tools.mjs`):

- `context_engine_handoffs(repo?, thread_tag?)` — returns active handoffs matching the filter, so a host app session can resume a thread. Repo-bound handoffs include `commits_past_head` plus a bounded `commit_timeline` with commit SHA, date, and subject.
- `context_engine_sync_project_handoff(repo)` — pull the host-written project file into CE after an LLM updates it.

## UI

A new "Handoffs" tab in the Electron admin panel, peer to Memory.

- Active handoffs list with title, binding, age, commit count.
- Click to view body as timeline cards, with a separate commit timeline in the detail panel for repo-bound handoffs.
- Manual editing is limited to the title. The handoff body is owned by host/LLM updates.
- Manual archive button.
- "Archived" sub-view with restore + purge-now actions.

## Memory boundary

Context Engine now has three different persistence jobs:

- **Global Memory**: durable facts and preferences about Jeremy/Shelley, stored globally.
- **Project Memory**: durable facts about a workspace or repo: architecture decisions, local commands, gotchas, naming conventions, release quirks. This should be added as a separate repo-bound surface, not folded into handoffs.
- **Handoffs**: short-lived in-flight state written by an LLM or host so another LLM/host can resume quickly.

Project Memory should become its own API/MCP surface, likely `context_engine_project_memory(repo)`, and should be loaded before handoffs. Handoffs can reference project memory, but they should not become the permanent home for project facts.

## Rate-limit-aware updates

Context Engine cannot infer another host's remaining messages, token budget, or reset window reliably. The correct design is a host-reported pressure signal:

- `low`: normal manual or milestone handoff writes.
- `medium`: write concise deltas at meaningful file/module boundaries.
- `high`: update every few minutes or before risky edits.
- `critical`: write an immediate compact checkpoint with current objective, files touched, blockers, and next command.

To keep token use controlled, rate-limit handoff writes should be delta-based and bounded. Do not append full transcripts. Prefer replacing the handoff body with a compact current-state summary plus the last few material changes. A future endpoint can accept `pressure`, `tokens_remaining_pct`, `reset_at`, and `summary_delta` from host adapters that expose those signals.

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
4. Keep `llm-handoff.md` as a compatibility bookmark for agents that still read the old convention first.

Implemented helper: `npm run migrate:handoffs` imports dated legacy entries into `data/handoffs/archive/` and keeps `data/handoffs/handoff-feature.md` as the active bookmark for this feature thread.

## Open questions

- Does the commit counter also include merge commits made by `git pull --rebase` etc., or only authored commits? Lean: count all commits that change HEAD, since the point is "code moved on."
- Should a handoff carry references to specific files (like the design Q3 from the convo earlier)? Punting for v1 — file-scoped staleness adds complexity that we don't need until repo-wide commits prove too noisy.
- Should thread handoffs sync somewhere outside the repo so they survive across machines? Out of scope for v1; covered by Memory if it matters.
- What exact project memory file/API shape should be used so every project gets durable local facts without bloating Global Memory?
