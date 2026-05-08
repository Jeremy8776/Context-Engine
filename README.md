# Context Engine

**The local context broker for AI host apps and coding agents.**

Run a local source of truth for skills, memory, rules, and modes. Host apps such as Claude Desktop, Codex, Cursor, and ChatGPT-style connectors can pull the right context at runtime, while legacy tools still get compiled instruction files.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![Desktop](https://img.shields.io/badge/desktop-Electron-blue.svg)](#desktop-app)

---

## What is Context Engine?

AI host apps need context in two different ways: runtime tools for chat-style apps, and instruction files for older IDE/CLI agents. Context Engine is the local broker behind both paths. The Electron app is the admin panel; the real work still happens in Claude Desktop, Codex, Cursor, ChatGPT-style connectors, and other host apps.

- Write modular **skills** (reusable instruction files)
- Toggle them on/off per task with **modes**
- Expose context through **MCP tools** for runtime lookup
- Compile fallback files for **22 AI tools**
- Track your **context budget** before it reaches the host

No cloud. No accounts. No API keys required. Runs entirely on your machine.

---

## Part of the DataCert AI Ecosystem

Context Engine is one part of a three-repo local AI stack:

| System             | Role                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **AI Model DB**    | Registry and directory for models, providers, capabilities, MCP servers, skills, and install metadata                    |
| **Context Engine** | Local context broker for memory, rules, skills, modes, MCP tools, and compiled file fallbacks                            |
| **DRAM**           | Runtime orchestration layer for API daemons, local models, hosted model calls, routing, logs, queues, and process health |

Short version:

> AI Model DB knows what exists. Context Engine brokers what context is active. DRAM runs and routes the systems that execute it.

See [docs/ECOSYSTEM.md](docs/ECOSYSTEM.md) for the system boundaries.

---

## Supported Tools

| Tool                     | Format                            | Global | Project |
| ------------------------ | --------------------------------- | ------ | ------- |
| **Claude Code**          | `CLAUDE.md`                       | Yes    | Yes     |
| **Cursor**               | `.cursorrules`                    | —      | Yes     |
| **GitHub Copilot**       | `.github/copilot-instructions.md` | —      | Yes     |
| **Windsurf**             | `.windsurfrules`                  | Yes    | Yes     |
| **Antigravity (Gemini)** | `GEMINI.md`                       | Yes    | Yes     |
| **Codex (OpenAI)**       | `.codex/instructions.md`          | Yes    | Yes     |
| **Cline / Roo**          | `.clinerules/`                    | Yes    | Yes     |
| **Continue.dev**         | `.continue/rules/`                | Yes    | Yes     |
| **Junie (JetBrains)**    | `.junie/guidelines.md`            | Yes    | Yes     |
| **Trae (ByteDance)**     | `.trae/rules/`                    | Yes    | Yes     |
| **Kiro (AWS)**           | `.kiro/steering.md`               | —      | Yes     |
| **Aider**                | `CONVENTIONS.md`                  | —      | Yes     |
| **Zed**                  | `.rules`                          | —      | Yes     |
| **AGENTS.md (AAIF)**     | `AGENTS.md`                       | —      | Yes     |
| **Amp (Sourcegraph)**    | `.ampcoderc`                      | —      | Yes     |
| **Devin**                | `devin.md`                        | —      | Yes     |
| **Goose (Block)**        | `.goosehints`                     | Yes    | Yes     |
| **Void**                 | `.void/rules.md`                  | —      | Yes     |
| **Augment**              | `.augment/instructions.md`        | Yes    | Yes     |
| **PearAI**               | `.pearai/rules.md`                | —      | Yes     |
| **Ollama**               | `Modelfile.context`               | —      | Yes     |
| **Kimi K2**              | `.kimi-system-prompt.md`          | —      | Yes     |

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
- Create, edit, and delete modes from the admin panel

### Runtime Bridge

Four read-only MCP tools (`context_engine_search`, `context_engine_list_skills`, `context_engine_get_skill`, `context_engine_status`) exposed across three transports, all sharing the same contract from a single `mcp-schemas.json`:

- **Local stdio** (`mcp-server.mjs`) — Claude Desktop, Codex CLI, Cursor, and compatible MCP hosts spawn this directly. The Outputs tab generates the snippet and writes the host config for you, preserving existing entries.
- **Claude Desktop extension** (`mcpb/context-engine`) — Blender-style local connector. Build with `npm run mcpb:pack`; users install the `.mcpb` and only configure a port.
- **Streamable HTTP** (`mcp-http-server.mjs`) — for ChatGPT and other remote-connector hosts. OAuth (authorization-code + PKCE + refresh-token rotation) when `MCP_OAUTH_PASSWORD` is set; refuses to bind a non-loopback host without auth. Full step-by-step Cloudflare Tunnel runbook in [docs/mcp-bridge.md](docs/mcp-bridge.md).

### Onboarding

A first-run discovery flow detects installed MCP hosts, summarizes skill/memory state, walks through connecting selected hosts, and offers to build the vector index. The result writes `data/onboarding.json` so subsequent launches skip straight to the dashboard.

### File Output Fallback

- Auto-detects which AI tools are installed on your system
- Compiles your context to each tool's native format
- Deploys globally or per-project for hosts that still rely on files
- One source of truth, 22 generated outputs

### Memory & Rules

- Persistent memory entries with categories (identity, preference, project, general)
- Editable coding rules, general rules, and personality/soul configuration
- Optional `sessionStart` rule — injected at the top of every compiled output so AI agents know where to look first when resuming work (e.g. point them at a handoff doc instead of letting them fish through the repo)
- All stored as JSON — version-controllable, portable

### Context Budgeting

- Real-time token estimates for your active context
- See what will be available to runtime tools and compiled outputs
- Admin panel: active skills, host connections, modes, token counts

### Security

The local CE HTTP server is a privileged surface (it can read your skills, write to workspaces, clone repos, store API keys), so the surface is hardened beyond "binds to 127.0.0.1":

- **DNS-rebinding guard** — `Host` header validated against a loopback allowlist before any handler runs; rejects requests targeting rebound public hostnames.
- **Strict body parser** — refuses non-`application/json` content types so browser "simple requests" can't bypass CORS preflight to issue side-effecting calls.
- **Write-path denylist** — workspace and compile-output paths blocked from system dirs, `.ssh`/`.aws`/`.gnupg`, host-app config dirs, and browser profile dirs.
- **Skills ingest** — `https://` only; hostname allowlist (github.com, gitlab.com, codeberg.org, bitbucket.org); strict owner/repo charset.
- **Encrypted API keys** — AES-256-GCM, key derived from machine-specific data; file written `mode 0o600`; backups deliberately exclude the keys file.
- **Security headers** — CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` on every UI response. CSP forbids `'unsafe-eval'` and `object-src`.
- **Electron renderer** — `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`, external links restricted to `http(s):` / `mailto:`, in-window navigation pinned to the loopback origin.
- **MCP HTTP** — OAuth passwords compared via `crypto.timingSafeEqual`; DCR `redirect_uri` constrained to a domain allowlist (claude.ai, chatgpt.com, openai.com, loopback); refresh tokens rotate on every use.
- **No telemetry, no cloud calls unless you opt in** (Anthropic key for skill metadata parsing; Ollama for local embeddings).

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v22+

### Install

```bash
git clone https://github.com/Jeremy8776/Context-Engine.git
cd Context-Engine
npm install
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

Open [http://localhost:3847](http://localhost:3847) in your browser. This is the admin panel for the local broker, not the main working surface.

### Desktop app

A packaged Electron build is also available. It runs the same local broker inside a native admin window with auto-update support via GitHub releases.

```bash
npm run desktop          # run from source
npm run build:win        # package Windows installer + portable
npm run build:mac        # package macOS dmg/zip
npm run build:linux      # package AppImage/deb
```

Auto-updates pull from the [GitHub Releases](https://github.com/Jeremy8776/Context-Engine/releases) channel.

### MCP bridge

Context Engine can also run as an MCP server so host apps can pull relevant skill context on demand instead of relying on compiled project files:

```bash
npm run mcp                # start stdio MCP bridge
npm run mcp:http           # start Streamable HTTP MCP bridge for remote connectors
npm run mcpb:pack          # build the Claude Desktop .mcpb extension
npm run smoke:mcp          # stdio handshake + tool schemas + read-only calls
npm run smoke:mcpb         # bundled MCPB wrapper smoke
npm run smoke:mcp:http     # full OAuth flow + tool calls over Streamable HTTP
npm run test:mcp-hosts     # host config installer safety rules
```

Local stdio supports Claude Desktop, Codex CLI, and compatible MCP hosts via `mcp-server.mjs`. The Claude Desktop `.mcpb` extension (in `dist/` after `mcpb:pack`) wraps the same wire over a zero-dep stdio shim. ChatGPT app/web support uses `mcp-http-server.mjs` behind HTTPS — the OAuth + Cloudflare Tunnel runbook is in [docs/mcp-bridge.md](docs/mcp-bridge.md).

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
    server.js              # Node.js HTTP server (port 3847)
    compiler.js            # Cross-tool compiler with 22 adapters
    router.js              # API route handlers
    lib/
      mcp-host-config.js   # Cross-platform Claude/Codex config installer
      onboarding.js        # First-run discovery + connect flow
      security.js          # Host-header guard + write-path denylist
      crypto.js            # AES-256-GCM key store
      embeddings.js        # Ollama-backed embeddings
      vectorstore.js       # Local vector index
      ...
  ui/
    index.html             # Single-page admin panel
    styles/                # Design tokens + component CSS
    *.js                   # Tab logic (skills, modes, memory, compile, config, dashboard, onboarding)
    ce-select.js           # Custom listbox replacement for native <select>
  electron/
    main.cjs               # Electron main process (sandbox: true)
    preload.cjs            # IPC bridge
    updater.cjs            # electron-updater wiring
  cli/
    index.js               # `context-engine` CLI entry
  scripts/                 # Smoke tests, pack-mcpb.ps1, generators, dev helpers
  mcp-schemas.json         # Single source of truth for MCP tool contract
  mcp-tools.mjs            # SDK-backed transport (used by stdio + HTTP)
  mcp-server.mjs           # Local stdio MCP bridge
  mcp-http-server.mjs      # Streamable HTTP MCP bridge for remote connectors
  mcp-oauth.mjs            # OAuth provider (PKCE + refresh-token rotation)
  mcpb/context-engine/     # Claude Desktop .mcpb extension source (zero-dep stdio shim)
  data/
    memory.json            # Persistent memory entries
    rules.json             # Coding rules, general rules, soul, sessionStart
    skill-states.json      # Active/inactive state per skill
    modes.json             # Saved mode configurations
    onboarding.json        # First-run completion marker
```

The core server stays vanilla Node.js HTTP. Runtime dependencies are kept narrow: `electron-updater` for desktop updates and `@modelcontextprotocol/sdk` for the MCP bridge.

---

## API

The server exposes a REST API on port 3847. The full live list is at `GET /api/docs`; the most-used routes:

| Method | Path                            | Description                                                |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/skills`                   | List all discovered skills                                 |
| GET    | `/api/skills/:id`               | Skill record + body, optional `?section=` for one slice    |
| POST   | `/api/skills/ingest`            | Clone a skill repo (allowlisted hosts only)                |
| POST   | `/api/skills/parse`             | LLM-parse skill descriptions                               |
| GET    | `/api/memory`                   | Get memory entries                                         |
| POST   | `/api/memory`                   | Save memory entries                                        |
| GET    | `/api/rules`                    | Get rules and soul                                         |
| POST   | `/api/rules`                    | Save rules and soul                                        |
| GET    | `/api/states`                   | Get skill active/inactive states                           |
| POST   | `/api/states`                   | Save skill states                                          |
| GET    | `/api/modes`                    | Get saved modes                                            |
| POST   | `/api/modes/apply`              | Apply a mode                                               |
| POST   | `/api/index`                    | Build the vector index for all active skills               |
| GET    | `/api/index/status`             | Index health: chunk count, model, last-built timestamp     |
| POST   | `/api/search`                   | Vector search across indexed chunks                        |
| GET    | `/api/mcp/hosts`                | Detected MCP hosts + setup status + snippets               |
| POST   | `/api/mcp/hosts/install`        | Safely install CE's MCP entry into a supported host config |
| GET    | `/api/onboarding`               | First-run discovery summary                                |
| POST   | `/api/onboarding/complete`      | Mark onboarding as done                                    |
| GET    | `/api/health`                   | Skill health check + context budget                        |
| POST   | `/api/compile/preview`          | Preview compiled output for selected targets               |
| POST   | `/api/compile`                  | Compile + write to a workspace directory                   |
| POST   | `/api/tools/install-global`     | Compile to global/home paths                               |
| GET    | `/api/tools/detect`             | Detect installed AI tools                                  |
| GET    | `/api/workspaces`               | List registered project workspaces                         |
| POST   | `/api/workspaces`               | Add or remove a workspace                                  |
| POST   | `/api/workspaces/compile`       | Compile to one or all registered workspaces                |
| GET    | `/api/keys/status`              | Check if API keys are configured                           |
| POST   | `/api/keys`                     | Save an encrypted API key                                  |
| DELETE | `/api/keys`                     | Remove an API key                                          |

---

## License

[MIT](LICENSE)
