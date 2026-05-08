# DRAM Design Contract For Context Engine

DRAM is the visual source of truth. This file is not mood-board guidance. It maps DRAM selectors and raw values to Context Engine selectors and tokens.

## Source Values

| DRAM value                                                                                            | Meaning                                                  | CE token                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `#060607`                                                                                             | App canvas / base black chosen for CE parity             | `--dram-bg-base`, `--bg`                |
| `#060606`                                                                                             | Standard card surface                                    | `--dram-card-bg`                        |
| `#18181c`                                                                                             | Skill and skill-preset card surface only                 | `--skill-preset-card-bg`                |
| `#111114`                                                                                             | Disabled skill card surface only                         | `--skill-card-disabled-bg`              |
| `#080809`                                                                                             | Elevated dark grey / shell hover surface                 | `--dram-bg-elevated`, `--dram-bg-hover` |
| `#1f1f25`                                                                                             | Skill and skill-preset card hover only                   | `--skill-preset-card-hover`             |
| `#050506`                                                                                             | Recessed input well                                      | `--dram-bg-recessed`                    |
| `#7c3aed`                                                                                             | Primary purple accent                                    | `--dram-accent`, `--accent`             |
| `#a78bfa`                                                                                             | Purple highlight text                                    | `--dram-accent-hi`, `--accent-hi`       |
| `#e2e2e7`                                                                                             | Primary text                                             | `--dram-text`, `--text`                 |
| `#c7c7cc`                                                                                             | Secondary text in CE, between DRAM primary and secondary | `--dram-text-2`, `--text-2`             |
| `#8e8e93`                                                                                             | Secondary/muted text                                     | `--dram-text-3`, `--text-3`             |
| `#48484a`                                                                                             | Tertiary/disabled text                                   | `--dram-text-4`, `--text-4`             |
| `rgba(255, 255, 255, 0.12)`                                                                           | Card border                                              | `--dram-card-border`                    |
| `rgba(255, 255, 255, 0.15)`                                                                           | Standard keyline                                         | `--dram-line`                           |
| `rgba(255, 255, 255, 0.08)`                                                                           | Subtle keyline                                           | `--dram-line-subtle`                    |
| `rgba(124, 58, 237, 0.35)`                                                                            | Card hover border                                        | `--dram-card-border-hover`              |
| `rgba(124, 58, 237, 0.55)`                                                                            | Card selected border                                     | `--dram-card-border-active`             |
| `linear-gradient(90deg, rgba(124, 58, 237, 0.16) 0%, rgba(124, 58, 237, 0.04) 55%, transparent 100%)` | Active nav row background only                           | `--dram-active-fade`                    |
| `rgba(124, 58, 237, 0.4)`                                                                             | Section divider line (solid purple, 1px)                 | `--dram-divider-fade`                   |

Raw color values belong in `tokens.css` only. Component CSS should reference tokens.

## CSS Discipline Rules

- Never use `!important`. If a DRAM rule does not apply, fix selector order, component ownership, or the import layer.
- Raw hex, rgba, shadows, and gradients live in `tokens.css` only. Component CSS consumes tokens.
- Do not solve specificity problems with longer selector chains when a component-specific layer is the correct fix.
- Do not apply nav styling to cards because an element is clickable.
- Every new visual rule must map to one component role in this document.

## Component Translation Table

| CE element                                                            | DRAM source                           | Exact design contract                                                                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapsed main nav icon button: `.app[data-nav="mini"] .tab-btn`      | `.sidebar .nav-item`                  | Transparent background; active state changes icon/accent only; no purple gradient; no card border.                                                                                            |
| Expanded main nav row: `.app[data-nav="full"] .tab-btn`               | `.dashboard-nav-item`                 | Flat row; active uses `--dram-active-fade`; left rail is `3px x 12px`, radius `999px`, purple `--accent`.                                                                                     |
| Skills source/category rows: `#skills-tab .skills-side-btn`           | `.dashboard-nav-item`, `.asset-item`  | Same as expanded nav row. Padding creates room for a left rail. No card border, no pill radius.                                                                                               |
| Memory category filters: `.memory-filter`                             | `.asset-item`                         | Same as expanded nav row. Active gets gradient and left rail.                                                                                                                                 |
| Workflow selector rows: `.dashboard-mode-btn`                         | `.dashboard-nav-item`                 | Same as expanded nav row if the row is inside a selector/list. Do not apply this to mode cards.                                                                                               |
| Skill grid card: `#skills-tab .grid-mode .skill-row`                  | `.plugin-card`                        | Background `--dram-card-bg`; border `--dram-card-border`; radius `8px` or closest CE radius token; min grid width `320px`; min height `168px`; padding `12px`; no nav gradient; no left rail. |
| Skill list row: `#skills-tab #skills-list:not(.grid-mode) .skill-row` | DRAM settings row/list row pattern    | Row layout; min height `56px`; background `--bg`; keyline border only. It must not inherit the grid card height or one-column card structure.                                                 |
| Mode card: `.mode-card`                                               | `.plugin-card`                        | Grey card surface, compact padding, hover purple border, selected purple border. No gradient and no left rail.                                                                                |
| Memory card: `.memory-card`                                           | `.plugin-card` / compact content card | Grey card surface, border state only. Active memory is a selected card, not a nav row.                                                                                                        |
| Output target card: `.compile-tool-card`                              | `.plugin-card`                        | Grey card surface, compact header, logo avatar, status pills. Focus/active states use border only.                                                                                            |
| Dashboard metric/panel card: `.dashboard-metric`, `.dashboard-panel`  | DRAM card/panel surfaces              | Grey surface with subtle border. Do not use selected nav styling just because a panel is emphasized.                                                                                          |
| Details panel: `.side-panel`, `.memory-detail`                        | DRAM right-side detail surface        | Same dark surface family, subtle border. It can be sticky/scrollable by page need, but its visual surface is not a nav row.                                                                   |
| Modal: `.memory-modal`, `.app-dialog`                                 | DRAM overlay/dialog                   | Card surface, subtle border, backdrop blur/dim. Header/footer use keylines, not nested cards.                                                                                                 |

## Cards

DRAM source: `settings/settings-plugins.css .plugin-card`

```css
background: #060606;
border: 1px solid rgba(255, 255, 255, 0.12);
border-radius: 8px;
padding: var(--space-3);
gap: var(--space-2);
min-height: 168px;
```

CE implementation:

```css
background: var(--dram-card-bg);
border: 1px solid var(--dram-card-border);
border-radius: var(--r-3);
padding: var(--s-3);
```

Card state mapping:

| State               | DRAM value                  | CE token                    |
| ------------------- | --------------------------- | --------------------------- |
| Default background  | `#060606`                   | `--dram-card-bg`            |
| Hover background    | `#0a0a0a`                   | `--dram-card-hover`         |
| Selected background | `#080808`                   | `--dram-card-active`        |
| Default border      | `rgba(255, 255, 255, 0.12)` | `--dram-card-border`        |
| Hover border        | `rgba(124, 58, 237, 0.35)`  | `--dram-card-border-hover`  |
| Selected border     | `rgba(124, 58, 237, 0.55)`  | `--dram-card-border-active` |
| Disabled opacity    | `0.66`                      | `--dram-card-muted-opacity` |

Card typography mapping:

| Part         | DRAM source           | CE target                                                                 |
| ------------ | --------------------- | ------------------------------------------------------------------------- |
| Card name    | `.plugin-name`        | `font-size: 11px`, uppercase, `letter-spacing: 0.07em`, semibold/bold     |
| Version/meta | `.plugin-version`     | mono, `10px`, tertiary text                                               |
| Description  | `.plugin-description` | `10px` to `11px`, secondary text, `line-height: 1.45`, clamp to 2-3 lines |
| Footer       | `.plugin-footer`      | flex row, `margin-top: auto`, compact status/action layout                |

Forbidden on cards:

- No `--dram-active-fade`.
- No active left rail.
- No pill-shaped nav background.
- No black `#000` card surface when the component is a card.
- No decorative top-edge highlight strip on accent cards or hero stats. Specifically, no `::before` 1px gradient line across the top of `.card.accent` or `.hero-stat`. Accent state is communicated by border and surface tint only.
- No purple divider on card headers. The `--dram-divider-fade` token is page-level only. If a card header needs separation from its body, use the neutral keyline `border-bottom: 1px solid var(--line)` — most card headers do not need any divider because the card border already frames them.

Skill and skill-preset exception:

| Scope                                              | Background | Hover     | Active    |
| -------------------------------------------------- | ---------- | --------- | --------- |
| `#skills-tab .grid-mode .skill-row:not(.inactive)` | `#18181c`  | `#1f1f25` | `#18181c` |
| `#skills-tab .grid-mode .skill-row.inactive`       | `#111114`  | `#111114` | n/a       |
| `.mode-card`, `.dashboard-mode-btn`                | `#18181c`  | `#1f1f25` | `#18181c` |

## Navigation Rows

DRAM sources: `dashboard.css .dashboard-nav-item`, `memory.css .asset-item`

```css
background: linear-gradient(
  90deg,
  rgba(124, 58, 237, 0.16) 0%,
  rgba(124, 58, 237, 0.04) 55%,
  transparent 100%
);
```

Left rail:

```css
left: var(--space-4);
width: 3px;
height: 12px;
border-radius: 999px;
background: var(--accent);
```

CE allowed selectors:

- `.app[data-nav="full"] .tab-btn.active`
- `.skills-side-btn.active`
- `.memory-filter.active`
- `.dashboard-mode-btn.active` only when used as a selector row
- `.compile-preview-tabs button.active` only because it behaves like a tab selector

CE forbidden selectors:

- `.skill-row.selected`
- `.mode-card.selected`
- `.memory-card.active`
- `.compile-tool-card`
- `.dashboard-panel`
- `.dashboard-metric`

## Toggles

DRAM source: `base.css .switch`

Standard toggle:

| Part                 | DRAM value                    | CE token/value                  |
| -------------------- | ----------------------------- | ------------------------------- |
| Track width          | `44px`                        | `.toggle { width: 44px; }`      |
| Track height         | `22px`                        | `.toggle { height: 22px; }`     |
| Track background     | `#09090a`                     | `--dram-toggle-bg`              |
| Track border         | `#262629`                     | `--dram-toggle-border`          |
| Track radius         | `4px`                         | `var(--r-1)`                    |
| Thumb size           | `20px x 18px`                 | `--dram-card-toggle-thumb-w/h`  |
| Thumb offset         | `left: 2px`, `bottom: 1px`    | `.toggle-track::after`          |
| Thumb background     | `linear-gradient(...)`        | `--dram-toggle-thumb-bg`        |
| Checked track border | `var(--accent)`               | `var(--accent)`                 |
| Checked thumb        | `linear-gradient(...)`        | `--dram-toggle-active-thumb-bg` |
| Checked thumb shift  | `translateX(18px)`            | `--dram-card-toggle-shift`      |
| Checked glow         | `0 0 12px var(--accent-glow)` | `var(--accent-glow)`            |

Rule: a toggle is a mechanical control. It should not look like a pill, badge, nav item, or card.

## Status Pills And Badges

DRAM source: `.plugin-status`

```css
font-size: 10px;
font-weight: bold;
letter-spacing: 0.08em;
padding: 2px 7px;
border-radius: 999px;
text-transform: uppercase;
border: 1px solid var(--border);
background: transparent;
```

CE mapping:

- `.badge`
- `.chip`
- `.ct-badge`
- `.memory-cat-badge`
- `#skills-tab .sr-trigger`

Status colors:

| State                 | DRAM values                                                       | CE tokens                                     |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Enabled/custom/accent | `rgba(124, 58, 237, 0.11)`, `#7c3aed`, `rgba(124, 58, 237, 0.45)` | `--accent-bg`, `--accent-hi`, `--accent-line` |
| Disabled/missing      | transparent, `--text-secondary`, `rgba(255, 255, 255, 0.14)`      | transparent, `--text-3`, `--line`             |
| Error                 | `rgba(239, 68, 68, 0.08)`, `#ef4444`, `rgba(239, 68, 68, 0.35)`   | `--err-bg`, `--err`, `--err`                  |
| Warning               | `rgba(245, 158, 11, 0.12)`, `#f59e0b`, `rgba(245, 158, 11, 0.4)`  | `--warn-bg`, `--warn`, `--warn`               |

## Subheaders And Dividers

DRAM source: `dashboard.css .section-header h2::after`

```css
font-size: 12px;
text-transform: uppercase;
letter-spacing: 0.11em;
background: rgba(124, 58, 237, 0.4);
height: 1px;
```

CE mapping (allowed):

- `.section-hdr h2::after` — page-level section heading.
- `#skills-tab .skill-group-header::after` — list group header.

CE forbidden (no purple divider on card headers):

- `.dashboard-panel-head h2::after`
- `.compile-card-head h3::after`
- `.memory-detail-head h3::after`
- Any header that lives inside a card surface.

Rule: the purple divider is a **page-level** heading separator only. It is a solid 1px purple line — not a gradient, not a card border, not a nav active state. Card headers separate from their body using the card's own keyline (`border-bottom: 1px solid var(--line)`) when separation is needed at all — most card headers don't need any divider because the card border already frames them. CE diverges from DRAM here intentionally: DRAM ships a faded gradient on every header; CE restricts purple to page-level section headings to keep the accent rare and meaningful.

## Page Surface Rules

| Surface            | DRAM source                             | CE value                               |
| ------------------ | --------------------------------------- | -------------------------------------- |
| App background     | `body.rams-dark`, `--bg-base`           | `--bg: var(--dram-bg-base)`            |
| Main content       | `.dashboard-main`                       | `--bg`                                 |
| Header keyline     | `.settings-header`                      | `border-bottom: 1px solid var(--line)` |
| Side panel keyline | `.dashboard-sidebar`, `.memory-sidebar` | `border-right: 1px solid var(--line)`  |
| Toolbar            | DRAM header/control strip               | transparent or `--bg`, keyline only    |

## Decorative Accents And Connectors

This section governs purely visual elements that are neither structural (card, nav, list) nor functional (toggle, pill). They exist only to communicate flow direction or emphasis.

### Flow connectors

DRAM-specific pattern. Permitted. Used to show directional flow between nodes in a pipeline or chain visualisation.

| CE selector   | DRAM source                  | Contract                                                                                                                                            |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pipe-arrow` | DRAM pipeline/flow connector | 1px height, `linear-gradient(90deg, var(--accent), transparent)`. Gradient is intentional — it encodes direction. Optional arrowhead via `::after`. |
| `.chain-join` | DRAM chain link connector    | 1px height, fixed short width (~22px), same gradient as `.pipe-arrow`. Used between adjacent chained nodes.                                         |

Rule: connectors are the **only** decorative element where a directional purple gradient is permitted. Do not borrow this gradient for dividers, card edges, or any non-directional element.

### Accent card edge highlights — forbidden

CE diverges from DRAM. CE does not use a top-edge highlight strip on accent cards or hero stats. Accent state is communicated by border colour and surface tint only.

Specifically forbidden:

- `::before` 1px gradient line across the top of `.card.accent`.
- `::before` 1px gradient line across the top of `.hero-stat`.
- Any equivalent decorative top/bottom edge strip on a card surface.

If a card needs more emphasis, raise its border to `--dram-card-border-active` or its surface to `--dram-card-active`. Do not add a glow strip.

### Full-width section rules

`<hr>`-style rules separating major page regions (not heading underlines) use the neutral keyline, not the purple divider token.

| CE selector        | Contract                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `.section-divider` | `border-top: 1px solid var(--line)`. Margin: `var(--s-7) 0`. Never purple. Use `--dram-divider-fade` only on heading `::after` separators. |

Rule for picking the right divider:

- Inline next to a heading? → heading `::after` with `--dram-divider-fade` (solid purple).
- Standalone full-width rule between page regions? → `.section-divider` with `--line` (neutral keyline).

## Brand Assets

Source of truth: [`app/ui/assets/brand/`](../ui/assets/brand/). All variants share the C-monogram-with-bridging-core mark — family-aligned with DRAM's `D` icon and model-db's record-node mark (same canvas, same accent, same stroke language).

### Asset variants

| File              | Use                                                                                                                      | Background         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `icon.svg`        | App icon, window icon, anywhere a self-contained square mark is needed. Has its own `#060607` rounded-square background. | Built-in `#060607` |
| `icon-mono.svg`   | Tray icon, inline UI use, currentColor surfaces. Single-colour version, inherits `currentColor`.                         | Faint currentColor |
| `icon-simple.svg` | Favicons and very small sizes (16/24/32 px). No background, just the C glyph + node. Minimum legible size: ~20 px.       | Transparent        |

### Geometry contract (do not redraw — reference these specs)

- Canvas: `256×256`, `rx=56` rounded square (matches DRAM).
- Stroke: `16px`, `linecap: round`, accent `#7c3aed`.
- C aperture: 70° opening on the right (`M 185 88 A 70 70 0 1 0 185 168`). Wide enough that the letterform reads unambiguously as a C at 16/32px taskbar sizes.
- Compiled-context core: `circle cx=155 cy=128 r=22`, fill `#7c3aed`. Sits **inside** the C body, biased toward the aperture — mirrors DRAM's interior-dot composition (one strong letterform + one accent dot belonging to it).

### Usage rules

- Always use a vector source. Never embed a rasterised PNG of the icon when an SVG can be used.
- No wordmark exists. The product is referenced by the icon alone — do not pair the icon with typeset "Context Engine" text inside the same SVG. If product name + mark are both needed, place them as separate elements in the layout.
- Clear space: minimum padding around the icon equals the corner radius (`56px` at 256, scale proportionally). Do not crowd with adjacent UI.
- Minimum sizes: `icon.svg` / `icon-mono.svg` at `≥32px`. `icon-simple.svg` at `≥16px`.
- Do not recolour the accent. The purple is `#7c3aed` everywhere — the same `--accent` token used across the UI. Mono uses `currentColor` only.
- Do not add a glow, drop shadow, or gradient overlay to the mark. The mark is flat by contract, matching DRAM and model-db.
- If a new context needs a variant not on this list (e.g. a horizontal lockup), add it to `brand/`, document it here, and link it. Do not improvise inline.

### Cross-product family

| Product        | Mark concept                                       | Shared elements                                    |
| -------------- | -------------------------------------------------- | -------------------------------------------------- |
| DRAM           | `D` outline + interior purple core dot             | Canvas, accent, stroke, rounded square, accent dot |
| Context Engine | `C` outline + bridging purple core at the aperture | Same canvas, accent, stroke, rounded square        |
| AI Models DB   | Three lines + terminal purple node                 | Same accent, rounded square, terminal node         |

Any future product mark in this ecosystem must reuse the canvas, accent, stroke language, and a single-purple-node motif. The shape of the glyph is what differentiates products.

## Implementation Checklist

Before changing a UI element, classify it:

1. Is it navigation or filtering? Use nav row rules.
2. Is it a repeated object users inspect? Use card rules.
3. Is it a dense table/list mode? Use list row rules.
4. Is it an on/off control? Use toggle rules.
5. Is it a label/state marker? Use status pill rules.
6. Is it a page-level section title? Use subheader/divider rules (purple divider permitted).
7. Is it a card header? Use the card's own keyline only — no purple divider.
8. Is it a directional flow connector? Use connector rules.
9. Is it a full-width region rule? Use `.section-divider` (neutral keyline), not the purple divider token.
10. Is it a brand mark placement? Use a variant from `app/ui/assets/brand/` — never improvise.

If a selector is both clickable and a card, it is still a card. Clickable does not mean nav styling.

If a visual element is purely decorative and not on this list, it likely should not exist — flag it before adding.
