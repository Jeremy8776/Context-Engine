# Context Engine

**The universal context orchestrator for AI coding agents.**

Manage skills, memory, rules, and modes across 22 AI tools from a single local dashboard. Write your instructions once — deploy everywhere.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)]()

---

## What is Context Engine?

AI coding agents read instruction files at startup — `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `.windsurfrules`, and more. Context Engine is a local dashboard that lets you manage all of them from one place.

- Write modular **skills** (reusable instruction files)
- Toggle them on/off per task with **modes**
- Compile and deploy to **22 AI tools** simultaneously
- Track your **context budget** in real-time

No cloud. No accounts. No API keys required. Runs entirely on your machine.

---

## Supported Tools

| Tool | Format | Global | Project |
|------|--------|--------|---------|
| **Claude Code** | `CLAUDE.md` | Yes | Yes |
| **Cursor** | `.cursorrules` | — | Yes |
| **GitHub Copilot** | `.github/copilot-instructions.md` | — | Yes |
| **Windsurf** | `.windsurfrules` | Yes | Yes |
| **Antigravity (Gemini)** | `GEMINI.md` | Yes | Yes |
| **Codex (OpenAI)** | `.codex/instructions.md` | Yes | Yes |
| **Cline / Roo** | `.clinerules/` | Yes | Yes |
| **Continue.dev** | `.continue/rules/` | Yes | Yes |
| **Junie (JetBrains)** | `.junie/guidelines.md` | Yes | Yes |
| **Trae (ByteDance)** | `.trae/rules/` | Yes | Yes |
| **Kiro (AWS)** | `.kiro/steering.md` | — | Yes |
| **Aider** | `CONVENTIONS.md` | — | Yes |
| **Zed** | `.rules` | — | Yes |
| **AGENTS.md (AAIF)** | `AGENTS.md` | — | Yes |
| **Amp (Sourcegraph)** | `.ampcoderc` | — | Yes |
| **Devin** | `devin.md` | — | Yes |
| **Goose (Block)** | `.goosehints` | Yes | Yes |
| **Void** | `.void/rules.md` | — | Yes |
| **Augment** | `.augment/instructions.md` | Yes | Yes |
| **PearAI** | `.pearai/rules.md` | — | Yes |
| **Ollama** | `Modelfile.context` | — | Yes |
| **Kimi K2** | `.kimi-system-prompt.md` | — | Yes |

---

## Features

### Skills Management
- Auto-discovers `SKILL.md` files from your filesystem
- Parses YAML frontmatter for descriptions and trigger phrases
- Toggle active/inactive per skill with instant context regeneration
- Import skill packs from GitHub repos (Anthropic, OpenAI, community)
- Group by source — see Custom, Anthropic, OpenAI skills separately

### Modes
- Save curated stacks of skills for specific workflows
- Switch between "Heavy Coding", "Creative", "Lean Mode" in one click
- Create, edit, and delete modes from the dashboard

### Cross-Tool Compiler
- Auto-detects which AI tools are installed on your system
- Compiles your context to each tool's native format
- Deploy globally or per-project
- One source of truth, 22 outputs

### Memory & Rules
- Persistent memory entries with categories (identity, preference, project, general)
- Editable coding rules, general rules, and personality/soul configuration
- All stored as JSON — version-controllable, portable

### Context Budgeting
- Real-time token estimates for your active context
- See exactly what gets loaded into each agent session
- Stats dashboard: active skills, connections, modes, token counts

### Security
- Encrypted API key storage (AES-256-GCM) for optional LLM features
- Keys derived from machine-specific data — not portable, not plain text
- Environment variables take precedence over stored keys
- No telemetry, no cloud calls unless you opt in

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+

### Install

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

Open [http://localhost:3847](http://localhost:3847) in your browser.

### Point at your data

Set `CE_ROOT` to your AI configuration directory:

```bash
CE_ROOT=/path/to/your/ai-config npm start
```

The server expects `data/`, `skills/`, and `CONTEXT.md` inside that root.

---

## Adding Skills

Create a directory under `skills/` with a `SKILL.md` file:

```
skills/
  my-custom-skill/
    SKILL.md
```

Use YAML frontmatter for best results:

```yaml
---
name: my-custom-skill
description: What this skill does and when an agent should use it.
---

# My Custom Skill

Instructions for the AI agent go here.
```

### Import from GitHub

Paste any GitHub repo URL into the ingest input on the Skills tab. The server clones it into `skills/ingested/` and discovers all `SKILL.md` files inside.

Pre-configured quick-add buttons for:
- [Anthropic Skills](https://github.com/anthropics/skills)
- [OpenAI Skills](https://github.com/openai/skills)

---

## Architecture

```
context-engine/
  server/
    server.js       # Zero-dependency Node.js HTTP server (port 3847)
    compiler.js     # Cross-tool compiler with 22 adapters
  ui/
    index.html      # Single-page dashboard
    styles.css      # Design system (CSS custom properties)
    skills.js       # Skills tab logic
    modes.js        # Modes tab logic
    memory.js       # Memory tab logic
    compile.js      # Compiler tab logic
    config.js       # Soul & Rules tab logic
    dashboard.js    # Dashboard tab logic
    panel.js        # Reusable side panel component
    store.js        # API client and state management
    data.js         # Data layer
  data/
    memory.json     # Persistent memory entries
    rules.json      # Coding rules, general rules, soul
    skill-states.json # Active/inactive state per skill
    modes.json      # Saved mode configurations
```

Zero external dependencies. No React, no build step, no npm install. Just Node.js serving vanilla HTML/CSS/JS.

---

## API

The server exposes a REST API on port 3847:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills` | List all discovered skills |
| GET | `/api/memory` | Get memory entries |
| POST | `/api/memory` | Save memory entries |
| GET | `/api/rules` | Get rules and soul |
| POST | `/api/rules` | Save rules and soul |
| GET | `/api/states` | Get skill active/inactive states |
| POST | `/api/states` | Save skill states |
| GET | `/api/modes` | Get saved modes |
| POST | `/api/modes` | Save modes |
| POST | `/api/modes/apply` | Apply a mode |
| POST | `/api/skills/ingest` | Clone a GitHub skill repo |
| POST | `/api/skills/parse` | LLM-parse skill descriptions |
| GET | `/api/health` | Skill health check + context budget |
| POST | `/api/compile` | Compile to project directory |
| POST | `/api/compile/global` | Compile to global/home paths |
| GET | `/api/detect-tools` | Detect installed AI tools |
| GET | `/api/keys/status` | Check if API keys are configured |
| POST | `/api/keys` | Save an encrypted API key |
| DELETE | `/api/keys` | Remove an API key |

---

## License

[MIT](LICENSE)
