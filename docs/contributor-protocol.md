# Contributor Protocol

How LLMs and humans hand off work in this codebase without making the next person re-read everything. Three artifacts, one habit.

> **Note on tracked vs untracked artifacts.** `docs/llm-handoff.md`, `TODO.md`, and `PLAN-V4.md` are **gitignored** because they accumulate per-contributor session state and strategic context that doesn't belong in a public repo. Each contributor maintains their own copies locally. The format and habit described below still apply — just keep the files out of commits.

## Three artifacts

### 1. `docs/llm-handoff.md` — the session journal

Living file. The most recent contributor updates it at session end. The next contributor reads it first.

Sections:

- **Last session** — one paragraph. What changed, what the goal was, what the verification was.
- **Open threads** — every TODO item currently `[~]`. For each: anchor file, "next step" hint, any blocking decision the next person needs to make.
- **Quick map** — the 8–12 files most relevant to current focus. Skip the obvious; list the non-obvious wiring (e.g. "preload bridge → main process → updater module → CI publish channel").
- **Watch outs** — invariants that aren't obvious from the code. Things that broke once. Things that will break if you do the obvious wrong thing.

Hard rules:

- Keep it short. If it grows past ~150 lines, prune the oldest "Last session" content; the journal is not a changelog (git log is).
- Do not paste verbatim TODO content. Reference TODO.md by anchor instead.
- Do not include personal data, secrets, or paths outside the repo.

### 2. `// SEE ALSO:` inline anchors

Greppable comment block at the top of files that participate in cross-cutting flows. Format:

```
// SEE ALSO:
//   electron/preload.cjs        — bridge: contextEngineDesktop.onUpdateEvent
//   ui/app-update.js            — renderer-side toast consumer
//   package.json (build.publish) — GitHub release channel auto-updater reads
//   .github/workflows/release.yml — CI that produces the artifacts
```

When to add one:

- The file is part of a chain that spans 3+ files (auth flows, lifecycle events, build pipelines).
- The wiring is non-obvious from imports alone (e.g. IPC channel names, env vars, file-system contracts).
- A contributor changing this file would need to look at the others.

When **not** to add one:

- Single-purpose files with normal imports — TypeScript already shows the relationship.
- Test/script files that don't outlive a session.

Grep all anchors with: `Grep "SEE ALSO:" --include="*.js" --include="*.cjs"`

### 3. Smarter `[~]` items in `TODO.md`

Every in-progress item gets two anchor lines so the next person doesn't have to reverse-engineer where the work was:

```
- `[~]` Convert renderer modules to typed modules.
  - Anchor: `ui/store.js` (last cleaned)
  - Next: tackle `ui/dashboard.js` (25 errors), then `ui/compile.js` (50 errors)
```

For nested sub-tasks the anchor + next can sit on the parent; sub-bullets keep their `[ ]` / `[x]`.

## One habit: end-of-session ritual

Before closing the session:

1. Run `npm run handoff` — opens / prints the handoff doc.
2. Update **Last session** with one paragraph (what + why + verification).
3. Update **Open threads** for any item you advanced or left mid-flight.
4. Add or update **Quick map** entries if you reorganised something or added a new cross-cutting flow.
5. Add a **Watch outs** entry if you tripped on something subtle that would catch the next person.
6. Commit the handoff with the rest of your work in the same logical commit, or as a final `docs(handoff):` commit if the session spanned several commits.

Skipping the ritual is fine for tiny, fully-resolved fixes. Default to writing it.

## What this is not

- Not a replacement for git log. Use `git log --oneline` for change history.
- Not a replacement for TODO.md. The TODO is the plan; the handoff is the bookmark.
- Not architectural docs. `docs/dram-design-map.md`, `docs/ECOSYSTEM.md`, `docs/release-checklist.md` cover those.
- Not a place for design debate. Decisions go in PR descriptions, ADRs, or the design map.
