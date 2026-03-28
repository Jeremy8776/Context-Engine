# Context Engine Alpha

A local, offline-first dashboard designed to orchestrate and manage your active AI agent contexts, system memory, and modular skills. Zero dependencies. Zero cloud. Zero API keys.

**Context Engine** dynamically regenerates your project's context manifest (`CONTEXT.md`, `CLAUDE.md`, or `AGENTS.md`) based on which skills you toggle in the UI. Instead of flooding an agent's context window with every tool and rule you've ever written, you curate "Modes" to inject precisely the capabilities required for the task at hand.

---

## Core Features

* **Context Budgeting** -- Instantly see how many characters and estimated tokens you are feeding the agent, and how many skills are currently active.
* **Granular Skill Toggling** -- Enable or disable custom `.md` skills and prompt libraries via a polished grid dashboard.
* **Modes and Presets** -- Save custom stacks of active skills for specific tasks (e.g. "Heavy Coding", "Creative", "Lean Mode").
* **Memory and Rules Editor** -- Edit core memory facts (`data/memory.json`) and operational rules directly via the UI.
* **Skill Health Monitor** -- Automated integrity checks that verify all referenced SKILL.md files exist on disk.
* **Backup and Restore** -- Snapshot your memory, rules, and skill states at any point and roll back if needed.
* **Premium Orchestrator UI** -- Liquid Glassmorphism design system with Poppins/Lora typography and smooth animations.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher

### Installation

```bash
git clone https://github.com/Jeremy8776/context-engine.git
cd context-engine
```

### Launch

**Windows:**
```
Launch Context Engine.bat
```

**macOS / Linux:**
```bash
chmod +x launch.sh
./launch.sh
```

**Manual:**
```bash
npm start
```

Open `http://localhost:3847` in your browser.

---

## How it Works

AI agents naturally look for a root manifest file (`CONTEXT.md`, `CLAUDE.md`, or `AGENTS.md`) to establish context on launch. Context Engine creates a central hub for all your modular skills sitting in the file system.

1. Write a custom skill instruction file (e.g., `skills/my-skill/SKILL.md`).
2. The server auto-discovers it on the dashboard.
3. Toggle it to inject it into your active context instantly.

When you toggle a Mode or click a Skill in the UI, the backend dynamically rewrites your context manifest, pointing the agent to only the skill paths you have marked active.

---

## Adding Custom Skills

Create a new directory under `skills/` with a `SKILL.md` file:

```
skills/
  my-custom-skill/
    SKILL.md
```

Optional YAML frontmatter improves dashboard display:

```yaml
---
name: my-custom-skill
description: What this skill does and when to use it.
---
```

See `skills/example-skill/SKILL.md` for a working template.

---

## Customization

The interface uses a Liquid Glassmorphism design system with CSS backdrop filters and mesh gradients. Swap palette bindings in the `:root` tokens of `ui/styles.css`.

---

## License

[MIT](LICENSE)
