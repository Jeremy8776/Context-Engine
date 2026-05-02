// @ts-check

/**
 * @typedef {Object} ToolRegistryEntry
 * @property {string} label
 * @property {string[]} detectPaths
 * @property {string | null} globalPath
 * @property {boolean} supportsGlobal
 * @property {boolean} supportsProject
 * @property {'auto' | 'manual'} category
 */

/** @type {Record<string, ToolRegistryEntry>} */
const TOOL_REGISTRY = {
  claude:      { label: 'Claude Code',      detectPaths: ['.claude'],       globalPath: 'CLAUDE.md',                         supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  cursor:      { label: 'Cursor',           detectPaths: ['.cursor'],       globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  agents:      { label: 'AGENTS.md (AAIF)', detectPaths: [],                globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  codex:       { label: 'Codex (OpenAI)',   detectPaths: ['.codex'],        globalPath: '.codex/instructions.md',            supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  copilot:     { label: 'GitHub Copilot',   detectPaths: [],                globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  windsurf:    { label: 'Windsurf',         detectPaths: ['.windsurf'],     globalPath: '.windsurfrules',                    supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  antigravity: { label: 'Antigravity',      detectPaths: ['.antigravity'],  globalPath: 'GEMINI.md',                         supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  kiro:        { label: 'Kiro (AWS)',       detectPaths: ['.kiro'],         globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  cline:       { label: 'Cline / Roo',      detectPaths: [],                globalPath: '.clinerules/context-engine.md',     supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  aider:       { label: 'Aider',            detectPaths: [],                globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  continue:    { label: 'Continue.dev',     detectPaths: ['.continue'],     globalPath: '.continue/rules/context-engine.md', supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  zed:         { label: 'Zed',              detectPaths: ['.config/zed'],   globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  junie:       { label: 'Junie (JetBrains)',detectPaths: ['.junie'],        globalPath: '.junie/guidelines.md',              supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  trae:        { label: 'Trae',             detectPaths: ['.trae'],         globalPath: '.trae/rules/context-engine.md',     supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  amp:         { label: 'Amp (Sourcegraph)',detectPaths: ['.ampcoderc'],    globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  devin:       { label: 'Devin',            detectPaths: ['.devin'],        globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  goose:       { label: 'Goose (Block)',    detectPaths: ['.config/goose'], globalPath: '.config/goose/.goosehints',          supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  void:        { label: 'Void',             detectPaths: ['.void'],         globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  augment:     { label: 'Augment',          detectPaths: ['.augment'],      globalPath: '.augment/instructions.md',          supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  pearai:      { label: 'PearAI',           detectPaths: ['.pearai'],       globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  ollama:      { label: 'Ollama',           detectPaths: ['.ollama'],       globalPath: null,                                supportsGlobal: false, supportsProject: true,  category: 'auto' },
  kimi:        { label: 'Kimi K2',          detectPaths: [],                globalPath: null,                                supportsGlobal: false, supportsProject: false, category: 'manual' },
};

module.exports = { TOOL_REGISTRY };
