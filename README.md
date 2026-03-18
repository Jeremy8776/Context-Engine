# Claude Manager v2

A beautifully local, offline-first dashboard designed to orchestrate and manage your active [Anthropic Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) contexts, system memory, and modular skills.

**Claude Manager** actively regenerates your local `CLAUDE.md` file based on what you toggle in the UI. Instead of flooding Claude's context window with every tool and rule you've ever written, you curate "Modes" (like *Developer*, *Creative*, or *Focus*) to inject precisely the tools Claude needs for the task at hand.

---

## Core Features

* **Context Budgeting:** Instantly see how much character payload you are feeding Claude, and how many skills are currently active.
* **Granular Skill Toggling:** Enable or disable custom `.md` skills and prompt libraries via a polished grid dashboard.
* **Modes & Presets:** Save custom stacks of active skills for specific tasks (e.g. "comfyui-dev", "job-search", "report-generation").
* **Memory & Rules Editor:** Edit core memory facts (`memory.json`) and specific LLM agent behaviors directly via the UI interface.
* **Anthropic-aligned UI:** A meticulously refined Web UI that authentically mirrors Anthropic's visual DNA (utilizing *Poppins/Lora* typography, elegant dark modes, and minimalist pill forms) so your tooling feels native.
* **Backup & Restore:** Safety mechanism to backup memory structures over time.

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Jeremy8776/claude-manager.git
   cd claude-manager
   ```

2. **Launch the interface:**
   If you are on Windows, simply run the highly-convenient launcher:
   `Launch Claude Manager.bat`

   If you are on MacOS or prefer running processes manually:
   ```bash
   cd server
   node server.js
   ```

3. **Open the Dashboard:** The web interface will serve on `http://localhost:3847`. Make sure the Node server stays active in your background!

---

## How it Works

Claude Code naturally looks for a root `CLAUDE.md` to establish context on launch. 
This application creates a central hub containing all your disparate modular tools/skills sitting in your file system. 

When you toggle a Mode or click an active Skill in the UI, the `server.js` backend dynamically re-writes your central `CLAUDE.md`, pointing Claude natively to only the `SKILL.md` paths you have marked True. 

1. Write a custom skill instruction file (e.g., `skills/example-skill/SKILL.md`).
2. Map it into `server/server.js` (`SKILL_MAP`) and `ui/data.js` (`SKILL_DATA`).
3. Toggle it visually in your browser and it's instantly live in your terminal!

---

## Modifying Themes
The interface gracefully handles both Light and Dark mode systems using CSS Media Queries mapping directly to Anthropic Brand guidelines. See `ui/styles.css` `:root` tokens if you want to swap palette bindings.
