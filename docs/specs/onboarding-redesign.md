# Onboarding Redesign — Spec

> Status: ready for implementation. 2026-05-11. Tracker: [TODO.md → P1: Onboarding redesign](../../TODO.md). Pattern reference: [`E:/DataCert/model-db/src/components/OnboardingWizard.tsx`](../../../../../model-db/src/components/OnboardingWizard.tsx).

## Problem

CE's onboarding screen is a full-viewport overlay with bespoke `.onboarding-*` CSS (408 lines) that reinvents card/nav/stat patterns instead of consuming DRAM tokens and global classes. Result: visually inconsistent with the rest of the app, selected states fail to read as accented, long detection paths overflow grid cells, and the "Discover" step crams three concerns (hosts, context, IDE surfaces) into one wall.

The sibling product `model-db` ships a polished onboarding wizard. Its pattern — centred modal, horizontal progress strip, one concern per step, inline feedback — is the model CE should match.

## Goals

1. **Visual conformance with DRAM**: every surface uses the tokens documented in [dram-design-map.md](../dram-design-map.md). No bespoke colour or border values. Card states use `--dram-card-border-active` for selected, not a neutral strong border.
2. **Polite first-run experience**: centred modal, not a full-screen takeover. The dashboard remains visible behind a dimmed backdrop.
3. **One concern per step**: each step solves one problem and shows one decision surface.
4. **Brand consistency**: header uses the actual `icon-simple.svg`, not a typeset `CE` placeholder.
5. **Resilient to long content**: detection paths and host summaries truncate cleanly with `text-overflow: ellipsis`, regardless of grid column count.
6. **Smaller footprint**: target ≤ 250 lines of CSS by reusing global classes (`.app-dialog`, `.plugin-card`, `.badge`, `.section-divider`, the nav-row pattern from `.dashboard-nav-item`).

## Non-goals

- Changing the onboarding's API contract. `/api/onboarding`, `/api/onboarding/complete`, `DS.installMcpHost`, `DS.indexSkills` all stay as they are.
- Adding new content. We're restructuring existing content into a better shape, not authoring new copy or new flows.
- Internationalisation. CE doesn't ship i18n; we don't need to mirror model-db's `useTranslation` hook.
- A "Done" celebration step. The final step's success state is the done state — closing the modal returns the user to the dashboard.

## New structure

Four steps, each focused on one decision.

| # | Step       | Concern                                                                       | Replaces                                |
| - | ---------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| 1 | **Connect**| Pick which MCP hosts (Claude Desktop, Codex CLI, ChatGPT) to wire CE into.    | Most of current "Discover" + "Connect". |
| 2 | **Context**| Review skills/memory/index. Optional inline "Build index" if Ollama present.  | "Available context" panel + part of "Health". |
| 3 | **IDE**    | Show detected fallback targets. Note that file output remains available.      | "IDE and file-output surfaces" panel.   |
| 4 | **Health** | Quick verification: hosts connected, skills active, index ready. Finish.      | Current "Health" step.                  |

Each step has Back / Next (or Skip for now / Finish on the last step). Steps 1 and 3 are skippable — the user can connect later via the Connections tab.

## Component contract

### Modal shell — `.app-dialog`

Reuse the global modal pattern. The dialog overlay carries `backdrop-filter: blur(24px)` + `--dram-backdrop` background dim. The dialog body uses `--dram-card-bg` background, `--dram-card-border` border, `--r-3` radius — all already in `dram-standard-pages.css`.

```
<div class="app-dialog-overlay onboarding-overlay" role="dialog" aria-modal="true">
  <div class="app-dialog onboarding-dialog">
    <header class="onboarding-header">...</header>
    <nav class="onboarding-progress">...</nav>
    <main class="onboarding-body">...</main>
    <footer class="onboarding-footer">...</footer>
  </div>
</div>
```

Dialog target size: `max-width: 760px; max-height: 90vh;`. Body scrolls; header/progress/footer pinned.

### Header

- Left: `<img src="ui/assets/brand/icon-simple.svg" />` at 28×28 + `<h2>Welcome to Context Engine</h2>` + small subtitle.
- Right: close `<button class="onboarding-close" aria-label="Close">×</button>` — calls `Onboarding.skip()`.

No `.onboarding-mark` text monogram. No typeset "Context Engine" string paired with the icon as a wordmark — the title is a heading next to the icon, not a lockup.

### Progress strip — `.onboarding-progress`

Horizontal row of numbered circles connected by short lines. State per step:

| State    | Circle background    | Circle text     | Connector line  |
| -------- | -------------------- | --------------- | --------------- |
| Done     | `--accent`           | white           | `--accent`      |
| Current  | `--accent`           | white           | `--dram-line-subtle` (line *after* current) |
| Upcoming | `--dram-bg-recessed` | `--text-4`      | `--dram-line-subtle` |

Connector: `height: 1px; width: 32px;`. Circle: `28×28; border-radius: 999px`. Step label sits under each circle in `--text-3`, `11px`, uppercase, `letter-spacing: 0.07em` (matches card-name typography from DRAM).

This is decorative-but-functional, not a nav row. Not styled as `.dashboard-nav-item`.

### Step body

Each step is a `<section class="onboarding-step-body" data-step="..."> ... </section>`.

Common pattern inside each step:

```
<header class="onboarding-step-head">
  <h3>Connect your AI hosts</h3>          (or step-specific title)
  <p>One sentence explaining the step.</p> (--text-3)
</header>
<div class="onboarding-step-content">
  ... cards or controls ...
</div>
```

### Cards

All cards in the onboarding body use the global card pattern from [dram-design-map.md → Cards](../dram-design-map.md#cards):

| Property           | Token                       |
| ------------------ | --------------------------- |
| Background         | `--dram-card-bg`            |
| Border             | `--dram-card-border`        |
| Hover background   | `--dram-card-hover`         |
| Hover border       | `--dram-card-border-hover`  |
| Selected background| `--dram-card-active`        |
| Selected border    | `--dram-card-border-active` |
| Radius             | `--r-3`                     |
| Disabled opacity   | `--dram-card-muted-opacity` |

Three card variants used:

1. **Host card** (step 1): logo avatar + title + summary + status badge. Clickable to toggle (the entire card, not a tiny checkbox). Selected = purple border per DRAM.
2. **Stat card** (step 2): label + big number + small hint. Not selectable. Used for Skills found / Active / Memory / Index.
3. **Surface card** (step 3): icon + label + signal text. Truncates path with `text-overflow: ellipsis`. Not selectable.

Card name typography per DRAM: `font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em`. Description: `11px`, `--text-3`, `line-height: 1.45`, clamp to 2-3 lines.

### Status pills

Reuse global `.ct-badge` + `.mcp-status-*` modifiers, already in place. Do not introduce a new `.onboarding-*` badge class.

### Footer

Sticky to dialog bottom inside `.app-dialog` body. Layout:

```
[ Skip for now ]         [ Back ] [ Continue ]
```

Skip-for-now is `.fb` (faint button) on the left. Back is `.fb` on the right; Continue/Finish is `.save-btn` (primary).

On step 1, Back is hidden. On step 4, Continue becomes "Finish setup".

## CSS budget

Target file size: ≤ 250 lines (current is 408).

Reused global pieces (don't redefine):

- `.app-dialog` + `.app-dialog-overlay` for modal frame.
- `.plugin-card` token contract (consume `--dram-card-*` tokens directly; no need to import the class itself).
- `.ct-badge`, `.mcp-status-*` for status pills.
- `.fb`, `.save-btn` for footer buttons.
- `.section-divider` for any horizontal rules (none planned).

New `.onboarding-*` rules only for:

- `.onboarding-overlay` (z-index + body-lock interaction).
- `.onboarding-dialog` (size constraints on top of `.app-dialog`).
- `.onboarding-header`, `.onboarding-close`.
- `.onboarding-progress`, `.onboarding-progress-step`, `.onboarding-progress-bar`.
- `.onboarding-step-body`, `.onboarding-step-head`, `.onboarding-step-content`.
- Grid layouts for host list / stat grid / surface grid.
- `.onboarding-footer`.

## JS structure

Rewrite `ui/onboarding.js` to:

1. Keep the `Onboarding` IIFE export and the same five public methods: `init`, `go`, `toggleHost`, `connectHost`, `buildIndex`, `finish`, `skip`. Existing callers in `ui/app.js` and the global click handlers stay working.
2. Replace `step: 'discover' | 'connect' | 'health'` with `step: 1 | 2 | 3 | 4` (numeric, matches the progress strip).
3. Split render into `renderConnect()`, `renderContext()`, `renderIde()`, `renderHealth()` — one per step, each returning the inner `<section>` for the body slot.
4. Keep escape/close handlers but mount on the overlay (click on backdrop = skip), not on `document.body`.
5. Remove the `document.body.classList.add('onboarding-active')` overflow hack — the modal sits inside the page; the dashboard underneath can stay scrollable or not, doesn't matter because the backdrop blocks pointer events.

JS target line count: ~280 (current is 341).

## API state preserved

`/api/onboarding` returns `{ shouldShow, hosts, tools, context }`. The new shape uses:

- `hosts` → step 1 (Connect)
- `context` → step 2 (Context)
- `tools` → step 3 (IDE)
- `context.index` + `hosts.status` → step 4 (Health)

No backend changes needed. `apiFetch('/onboarding')` is called once on `init()`, and again via `refresh()` after `connectHost()` or `buildIndex()`.

## Accept criteria

- Visual diff: no rule references a raw hex or rgba outside `tokens.css`. `npm run lint:css` stays green.
- Selected host cards have a visible purple border (`--dram-card-border-active`), distinguishable from default + hover.
- Long detection paths in step 3 (e.g. `AppData/Roaming/Cursor, AppData/Local/Programs/cursor`) truncate inside the card with `…`, no horizontal overflow.
- Brand icon in the header is `icon-simple.svg`, rendered at 28×28.
- No `.onboarding-mark` text monogram anywhere.
- No `::before` decorative gradient strip on any onboarding surface.
- The dashboard remains visible (dimmed) behind the modal.
- `npm run typecheck`, `npm run lint`, `npm run lint:css`, `npm run smoke` all pass.

## Migration / rollout

1. Implement in a single commit. The before-state is broken enough that staged migration isn't worth the complexity.
2. Reset `data/onboarding.json` is not required — the completion flag has the same shape on either side of the change. Returning users won't see the new flow unless they manually reopen it.
3. If something regresses post-merge, the rollback is reverting the single commit; the API contract is unchanged so older clients don't break.

## Open questions deferred to implementation

1. **Should step 2 trigger a "Build index" call inline, or just show "Build on Health"?** Lean toward letting the user trigger it in step 2 if Ollama is detected and the index is empty — saves a click. Step 4 then verifies, doesn't initiate.
2. **What's the close behaviour mid-flow?** Treat as Skip (call `/onboarding/complete` so we don't re-prompt every launch). Add a "Don't show again" toggle in the header if testers ask.
3. **Should we show a `Skip` button on every step, or only step 1?** Current code only shows it on step 1 ("Skip for now"). The model-db wizard doesn't have skip at all. Mid-flow skips are confusing; leave it on step 1 only and rely on the close X for later steps.
