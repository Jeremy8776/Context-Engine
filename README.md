# Context Engine Alpha

A beautifully local, offline-first dashboard designed to orchestrate and manage your active AI agent contexts, system memory, and modular skills.

**Context Engine** actively regenerates your local `CONTEXT.md` file based on what you toggle in the UI. Instead of flooding an agent's context window with every tool and rule you've ever written, you curate "Modes" (like *Developer*, *Creative*, or *Focus*) to inject precisely the tools required for the task at hand.

---

## Core Features

* **Context Budgeting:** Instantly see how much character payload you are feeding the agent, and how many skills are currently active.
* **Granular Skill Toggling:** Enable or disable custom `.md` skills and prompt libraries via a polished grid dashboard.
* **Modes & Presets:** Save custom stacks of active skills for specific tasks (e.g. "comfyui-dev", "job-search", "report-generation").
* **Memory & Rules Editor:** Edit core memory facts (`memory.json`) and specific agent behaviors directly via the UI interface.
* **Premium Orchestrator UI:** A meticulously refined Web UI utilizing Liquid Glassmorphism, Poppins/Lora typography, and vibrant animations for a state-of-the-art experience.
* **Backup & Restore:** Safety mechanism to backup memory structures over time.

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Jeremy8776/context-engine.git
   cd context-engine
   ```

2. **Launch the interface:**
   If you are on Windows, simply run the launcher:
   `Launch Context Engine.bat`

3. **Open the Dashboard:** The web interface will serve on `http://localhost:3847`. Make sure the Node server stays active in your background!

---

## How it Works

Agents naturally look for a root `CONTEXT.md` (or similar manifest) to establish context on launch. 
This application creates a central hub containing all your disparate modular tools/skills sitting in your file system. 

When you toggle a Mode or click an active Skill in the UI, the `server.js` backend dynamically re-writes your central `CONTEXT.md`, pointing the agent natively to only the `SKILL.md` paths you have marked True. 

1. Write a custom skill instruction file (e.g., `skills/example-skill/SKILL.md`).
2. Discover it visually in the dashboard.
3. Toggle it to inject it into your active context instantly!

---

## Modifying Themes
The interface utilizes a Liquid Glassmorphism system with CSS backdrop filters and mesh gradients. See `ui/styles.css` `:root` tokens if you want to swap palette bindings.
