// @ts-check

/**
 * @typedef {Object} ToolRegistryEntry
 * @property {string} label
 * @property {string} description
 * @property {string[]} detectPaths
 * @property {string | null} globalPath
 * @property {boolean} supportsGlobal
 * @property {boolean} supportsProject
 * @property {'auto' | 'manual'} category
 */

/** @type {Record<string, ToolRegistryEntry>} */
const TOOL_REGISTRY = {
  claude: {
    label: 'Claude Code',
    description:
      'Claude Code reads CLAUDE.md at global and project scope. Use this to carry CE rules, memory cues, and repo-specific operating preferences into coding sessions.',
    detectPaths: ['.claude', 'AppData/Roaming/Claude Code'],
    globalPath: 'CLAUDE.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  cursor: {
    label: 'Cursor',
    description:
      'Cursor consumes workspace instruction files for editor chat and agent flows. CE syncs project context here without needing a live MCP connection.',
    detectPaths: ['.cursor', 'AppData/Roaming/Cursor', 'AppData/Local/Programs/cursor'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  agents: {
    label: 'AGENTS.md (AAIF)',
    description:
      'Open project instruction standard used by Codex-style agents. CE writes portable workspace guidance that travels with the repository.',
    detectPaths: [],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  codex: {
    label: 'Codex (OpenAI)',
    description:
      'Codex can read shared instructions from ~/.codex and project outputs. Use this for CLI or agent sessions that should inherit CE memory and rules.',
    detectPaths: ['.codex'],
    globalPath: '.codex/instructions.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  copilot: {
    label: 'GitHub Copilot',
    description:
      'GitHub Copilot can read repository instructions in VS Code and GitHub. CE uses this path to align chat and inline suggestions with project context.',
    detectPaths: ['.vscode', 'AppData/Roaming/Code/User', 'AppData/Roaming/Code - Insiders/User'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  windsurf: {
    label: 'Windsurf',
    description:
      'Windsurf reads global and workspace rule files for Cascade and editor assistance. CE keeps those rules in step with the active knowledge base.',
    detectPaths: ['.windsurf', 'AppData/Roaming/Windsurf', 'AppData/Local/Programs/Windsurf'],
    globalPath: '.windsurfrules',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  antigravity: {
    label: 'Antigravity',
    description:
      'Antigravity uses Gemini-style instruction files such as GEMINI.md. CE writes the shared and workspace context this host can pick up.',
    detectPaths: ['.antigravity'],
    globalPath: 'GEMINI.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  kiro: {
    label: 'Kiro (AWS)',
    description:
      'Kiro works from project-level steering files. CE can generate workspace instructions so specs and agent tasks start with the same context.',
    detectPaths: ['.kiro'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  cline: {
    label: 'Cline / Roo',
    description:
      'Cline and Roo use rule files inside VS Code extension storage and projects. CE can sync persistent working rules into those agent runs.',
    detectPaths: ['AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev'],
    globalPath: '.clinerules/context-engine.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  aider: {
    label: 'Aider',
    description:
      'Aider is a terminal coding assistant that can use project config and instruction files. CE only enables this when a real Aider signal is found.',
    detectPaths: ['.aider.conf.yml', '.aider.conf.yaml', '.aider.model.settings.yml', '.aider'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  continue: {
    label: 'Continue.dev',
    description:
      'Continue.dev reads rule files for IDE chat and autocomplete workflows. CE syncs shared and project guidance into that rule surface.',
    detectPaths: ['.continue', 'AppData/Roaming/Code/User/globalStorage/continue.continue'],
    globalPath: '.continue/rules/context-engine.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  zed: {
    label: 'Zed',
    description:
      'Zed supports project-level assistant context. CE prepares workspace guidance for Zed users without assuming a runtime bridge exists.',
    detectPaths: ['.config/zed'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  junie: {
    label: 'Junie (JetBrains)',
    description:
      'Junie reads JetBrains project guidance files. CE can publish repo instructions for agent work inside supported JetBrains environments.',
    detectPaths: ['.junie'],
    globalPath: '.junie/guidelines.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  trae: {
    label: 'Trae',
    description:
      'Trae uses workspace rule files for AI coding assistance. CE can generate the context file this host expects per project.',
    detectPaths: ['.trae'],
    globalPath: '.trae/rules/context-engine.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  amp: {
    label: 'Amp (Sourcegraph)',
    description:
      'Amp can consume project instructions through its repo configuration. CE treats it as a workspace sync target when Amp config is detected.',
    detectPaths: ['.ampcoderc'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  devin: {
    label: 'Devin',
    description:
      'Devin works from repository-level instructions. CE can prepare project context for delegated engineering tasks where Devin config exists.',
    detectPaths: ['.devin'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  goose: {
    label: 'Goose (Block)',
    description:
      'Goose reads local hints and project guidance. CE can write those hints so Goose sessions start with the same operating context.',
    detectPaths: ['.config/goose'],
    globalPath: '.config/goose/.goosehints',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  void: {
    label: 'Void',
    description:
      'Void is treated as a project instruction host. CE can write workspace guidance for Void-based coding sessions when its config is present.',
    detectPaths: ['.void'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  augment: {
    label: 'Augment',
    description:
      'Augment can use global and project instruction files. CE syncs persistent rules into that surface for codebase-aware assistance.',
    detectPaths: ['.augment'],
    globalPath: '.augment/instructions.md',
    supportsGlobal: true,
    supportsProject: true,
    category: 'auto',
  },
  pearai: {
    label: 'PearAI',
    description:
      'PearAI is an editor host for project-level AI instructions. CE prepares workspace context when a PearAI project is detected.',
    detectPaths: ['.pearai'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  ollama: {
    label: 'Ollama',
    description:
      'Ollama itself is a local model runtime, so CE treats it as a project context surface rather than a managed MCP host.',
    detectPaths: ['.ollama'],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: true,
    category: 'auto',
  },
  kimi: {
    label: 'Kimi K2',
    description:
      'Kimi does not expose a managed local sync path here. CE can still prepare context for manual copy when you want to use it in chat.',
    detectPaths: [],
    globalPath: null,
    supportsGlobal: false,
    supportsProject: false,
    category: 'manual',
  },
};

module.exports = { TOOL_REGISTRY };
