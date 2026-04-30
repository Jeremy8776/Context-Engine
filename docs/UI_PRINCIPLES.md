# Context Engine UI Principles

Context Engine follows the shared ecosystem product language, with AI Model DB as the UI role model.

## Source Principles

### DRAM

- Use a sparse black workspace.
- Use violet only for active state, focus, and primary actions.
- Prefer icons and short labels over decorative copy.
- Keep runtime/status information close to the shell, not inside large dashboard cards.
- Borrow DRAM's operational seriousness, not its compact density.

### AI Model DB

- Treat data as the product.
- Put search and high-frequency actions at the top of the work surface.
- Use filters and controls as side/toolbar surfaces.
- Render primary entities as rounded, scannable rows.
- Open details in a side panel instead of expanding the main layout.
- Give controls enough spacing that the app feels designed, not compressed.

## Context Engine Application

Context Engine is a context control plane, not a marketing dashboard.

Top-level sections map to the ecosystem model:

- Context: active context, budget, health, and manifest.
- Skills: searchable/toggleable instruction modules.
- Modes: saved context profiles and workflow chains.
- Memory: persistent knowledge used in generated context.
- Rules: behaviour, coding, and system rules.
- Outputs: compiled files for Claude, Codex, Cursor, and other tools.
- Registry: detected tools, MCP servers, and installable ecosystem packs.

## Layout Rules

- No hero sections.
- No decorative diagrams as primary UI.
- No card grids for operational data by default.
- Use readable rows first; use cards only for repeated registry tiles or compact summaries.
- Keep all important state visible without scrolling when possible.
- Use side panels for inspection and editing.
- Preserve keyboard-first paths through the command palette and search fields.
- Keep the left navigation labelled. Context Engine is an operator console, not a narrow icon dock.

## Visual Rules

- Background: black.
- Surface: black or near-black.
- Borders: thin, low-contrast.
- Accent: violet `#7c3aed`.
- Radius: 12px for controls, 14px for rows, 18px for major panels.
- Typography: Inter for UI, JetBrains Mono for status, code, labels, and paths.
- Motion: minimal; transitions should clarify state, not decorate.
