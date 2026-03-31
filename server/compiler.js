// compiler.js — Cross-tool Context Compiler
// Generates context files for 22 AI tools from a single source of truth

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---- TOOL REGISTRY ----
// Maps each tool to detection signals, global write path, and capabilities

const TOOL_REGISTRY = {
  claude:       { label: 'Claude Code',      detectPaths: ['.claude'],       globalPath: 'CLAUDE.md',                          supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  cursor:       { label: 'Cursor',           detectPaths: ['.cursor'],       globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  agents:       { label: 'AGENTS.md (AAIF)', detectPaths: [],                globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  codex:        { label: 'Codex (OpenAI)',   detectPaths: ['.codex'],        globalPath: '.codex/instructions.md',             supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  copilot:      { label: 'GitHub Copilot',   detectPaths: [],                globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  windsurf:     { label: 'Windsurf',         detectPaths: ['.windsurf'],     globalPath: '.windsurfrules',                     supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  antigravity:  { label: 'Antigravity',      detectPaths: ['.antigravity'],  globalPath: 'GEMINI.md',                          supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  kiro:         { label: 'Kiro (AWS)',       detectPaths: ['.kiro'],         globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  cline:        { label: 'Cline / Roo',      detectPaths: [],                globalPath: '.clinerules/context-engine.md',      supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  aider:        { label: 'Aider',            detectPaths: [],                globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  continue:     { label: 'Continue.dev',     detectPaths: ['.continue'],     globalPath: '.continue/rules/context-engine.md',  supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  zed:          { label: 'Zed',              detectPaths: ['.config/zed'],   globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  junie:        { label: 'Junie (JetBrains)',detectPaths: ['.junie'],        globalPath: '.junie/guidelines.md',               supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  trae:         { label: 'Trae',             detectPaths: ['.trae'],         globalPath: '.trae/rules/context-engine.md',      supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  amp:          { label: 'Amp (Sourcegraph)', detectPaths: ['.ampcoderc'],     globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  devin:        { label: 'Devin',            detectPaths: ['.devin'],        globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  goose:        { label: 'Goose (Block)',    detectPaths: ['.config/goose'], globalPath: '.config/goose/.goosehints',           supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  void:         { label: 'Void',             detectPaths: ['.void'],         globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  augment:      { label: 'Augment',          detectPaths: ['.augment'],      globalPath: '.augment/instructions.md',            supportsGlobal: true,  supportsProject: true,  category: 'auto' },
  pearai:       { label: 'PearAI',           detectPaths: ['.pearai'],       globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  ollama:       { label: 'Ollama',           detectPaths: ['.ollama'],       globalPath: null,                                 supportsGlobal: false, supportsProject: true,  category: 'auto' },
  kimi:         { label: 'Kimi K2',          detectPaths: [],                globalPath: null,                                 supportsGlobal: false, supportsProject: false, category: 'manual' },
};

/**
 * Detect which AI tools are installed on the system.
 */
function detectTools(homedir) {
  homedir = homedir || os.homedir();
  const results = {};
  for (const [id, reg] of Object.entries(TOOL_REGISTRY)) {
    const tool = {
      id,
      label: reg.label,
      installed: false,
      signals: [],
      supportsGlobal: reg.supportsGlobal,
      supportsProject: reg.supportsProject,
      category: reg.category,
      globalPath: reg.globalPath ? path.join(homedir, reg.globalPath) : null,
      globalInstalled: false,
    };
    for (const dp of reg.detectPaths) {
      const full = path.join(homedir, dp);
      if (fs.existsSync(full)) { tool.installed = true; tool.signals.push(dp); }
    }
    if (tool.globalPath && fs.existsSync(tool.globalPath)) {
      tool.globalInstalled = true;
    }
    results[id] = tool;
  }
  return results;
}

/**
 * Compile and write to each tool's global/home config path.
 */
function compileToGlobal(opts, homedir) {
  homedir = homedir || os.homedir();
  const { targets = [] } = opts;
  const ctx = buildContext(opts);
  const installed = {};
  const errors = [];

  for (const target of targets) {
    const reg = TOOL_REGISTRY[target];
    if (!reg || !reg.globalPath) { errors.push(`${target}: no global path`); continue; }

    // Codex uses AGENTS.md format for its instructions.md
    const adapterId = target === 'codex' ? 'agents' : target;
    const adapter = ADAPTERS[adapterId];
    if (!adapter) { errors.push(`${target}: no adapter`); continue; }

    try {
      const content = adapter.fn(ctx);
      const tokens = estimateTokens(content);
      const outPath = path.join(homedir, reg.globalPath);
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, content, 'utf8');
      installed[target] = { path: outPath, tokens, filename: reg.globalPath };
    } catch (e) {
      errors.push(`${target}: ${e.message}`);
    }
  }

  return { ok: true, installed, errors, context: { activeSkills: ctx.activeSkills.length, totalSkills: ctx.totalSkills } };
}

// ---- FORMAT ADAPTERS ----

function compileForClaude(ctx) {
  const now = new Date().toISOString().split('T')[0];
  const skillTable = ctx.activeSkills.map(s => {
    const relPath = s.relativePath || s.path;
    return `| ${(s.cat || 'Uncategorized').padEnd(28)} | ${relPath} |`;
  }).join('\n');

  const rulesBlock = ctx.rules
    ? `## Operational Rules\n- **Coding:** ${ctx.rules.coding}\n- **General:** ${ctx.rules.general}\n- **Soul:** ${ctx.rules.soul}\n`
    : '';

  return `# System Context
> Auto-loaded by AI Agent. Last updated: ${now}.
> Active skills: ${ctx.activeSkills.length}/${ctx.totalSkills}. Compiled by Context Engine.

---

## Data Files (read at session start)
| File | Purpose |
|------|---------|
| data/memory.json | Built memory |
| data/rules.json | Operational rules |
| data/skill-states.json| Which skills are active/inactive |

---

${rulesBlock}
## Active Skills (${ctx.activeSkills.length}/${ctx.totalSkills})
Before any task, check if a matching skill is active, then read its SKILL.md.

| Task type                     | Skill file |
|-------------------------------|------------|
${skillTable}
`;
}

function compileForCursor(ctx) {
  const sections = [];

  if (ctx.rules) {
    sections.push(`# Rules\n\n## Coding\n${ctx.rules.coding}\n\n## General\n${ctx.rules.general}\n\n## Personality\n${ctx.rules.soul}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`# Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills.map(s => {
      let content = '';
      if (s.skillContent) {
        // Strip YAML frontmatter for Cursor (it doesn't use it)
        content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
        // Cursor works best with concise rules, take first 2000 chars per skill
        if (content.length > 2000) content = content.slice(0, 2000) + '\n...(truncated)';
      }
      return `## ${s.id}\n${s.desc}\n${content ? '\n' + content : ''}`;
    }).join('\n\n');
    sections.push(`# Active Skills\n\n${skillBlocks}`);
  }

  return sections.join('\n\n---\n\n');
}

function compileForAgentsMd(ctx) {
  const now = new Date().toISOString().split('T')[0];
  const sections = [];

  // AGENTS.md header per AAIF spec
  sections.push(`---
version: 1
agent:
  name: context-engine-agent
  description: AI coding assistant configured by Context Engine
  updated: ${now}
---

# Agent Instructions`);

  if (ctx.rules) {
    sections.push(`## Rules

### Coding
${ctx.rules.coding}

### General
${ctx.rules.general}

### Personality
${ctx.rules.soul}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

function compileForCopilot(ctx) {
  const sections = [];

  if (ctx.rules) {
    sections.push(`# Instructions\n\n${ctx.rules.coding}\n\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillRules = ctx.activeSkills.map(s => {
      let content = s.desc;
      if (s.skillContent) {
        content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
        if (content.length > 1500) content = content.slice(0, 1500) + '\n...(truncated)';
      }
      return `## ${s.id}\n${content}`;
    }).join('\n\n');
    sections.push(skillRules);
  }

  return sections.join('\n\n');
}

function compileForWindsurf(ctx) {
  // Windsurf format is similar to Cursor — flat text rules
  const sections = [];

  if (ctx.rules) {
    sections.push(`# Rules\n${ctx.rules.coding}\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills.map(s => {
      let content = s.desc;
      if (s.skillContent) {
        content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
        if (content.length > 2000) content = content.slice(0, 2000) + '\n...(truncated)';
      }
      return `## ${s.id}\n${content}`;
    }).join('\n\n');
    sections.push(`# Skills\n\n${skillBlocks}`);
  }

  return sections.join('\n\n');
}

// ---- Google Antigravity (GEMINI.md) ----
function compileForAntigravity(ctx) {
  const sections = [];
  sections.push(`# Project Rules\n> Compiled by Context Engine\n`);

  if (ctx.rules) {
    sections.push(`## Coding Standards\n${ctx.rules.coding}\n\n## General Guidelines\n${ctx.rules.general}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills.map(s => {
      let content = s.desc;
      if (s.skillContent) {
        content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
        if (content.length > 2000) content = content.slice(0, 2000) + '\n...(truncated)';
      }
      return `## ${s.id}\n${content}`;
    }).join('\n\n');
    sections.push(`# Skills\n\n${skillBlocks}`);
  }

  return sections.join('\n\n');
}

// ---- AWS Kiro (.kiro/steering.md) ----
function compileForKiro(ctx) {
  const sections = [];
  sections.push(`# Project Steering\n> Auto-generated by Context Engine. Do not edit manually.\n`);

  if (ctx.rules) {
    sections.push(`## Coding Conventions\n${ctx.rules.coding}\n\n## General Rules\n${ctx.rules.general}\n\n## Personality\n${ctx.rules.soul}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `### ${s.id}\n${s.desc}`).join('\n\n');
    sections.push(`## Available Skills\n\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Cline / Roo Code (.clinerules/) ----
function compileForCline(ctx) {
  const sections = [];
  // Cline supports YAML frontmatter for conditional rules
  sections.push(`---
description: Context Engine project rules
globs: "**/*"
---

# Project Rules`);

  if (ctx.rules) {
    sections.push(`## Coding\n${ctx.rules.coding}\n\n## General\n${ctx.rules.general}\n\n## Personality\n${ctx.rules.soul}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Active Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Aider (CONVENTIONS.md) ----
function compileForAider(ctx) {
  const sections = [];
  sections.push(`# Coding Conventions\n> Auto-generated by Context Engine.\n`);

  if (ctx.rules) {
    sections.push(`## Style & Standards\n${ctx.rules.coding}`);
    sections.push(`## General\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Project Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Continue.dev (.continue/rules/) ----
function compileForContinue(ctx) {
  const sections = [];
  sections.push(`# Context Engine Rules\n`);

  if (ctx.rules) {
    sections.push(`## Coding Rules\n${ctx.rules.coding}\n\n## General Rules\n${ctx.rules.general}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Zed (.rules) ----
function compileForZed(ctx) {
  const sections = [];

  if (ctx.rules) {
    sections.push(`${ctx.rules.coding}\n\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- ${s.id}: ${s.desc}`).join('\n');
    sections.push(`Active skills:\n${skillList}`);
  }

  // Zed .rules is plain text, keep it concise
  return sections.join('\n\n');
}

// ---- JetBrains Junie (.junie/guidelines.md) ----
function compileForJunie(ctx) {
  const sections = [];
  sections.push(`# Project Guidelines\n> Generated by Context Engine. Junie reads this file automatically.\n`);

  if (ctx.rules) {
    sections.push(`## Coding Standards\n${ctx.rules.coding}\n\n## General Guidelines\n${ctx.rules.general}\n\n## Personality\n${ctx.rules.soul}`);
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Project Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills.map(s => `### ${s.id}\n${s.desc}`).join('\n\n');
    sections.push(`## Skills\n\n${skillBlocks}`);
  }

  return sections.join('\n\n');
}

// ---- Trae / ByteDance (.trae/rules/) ----
function compileForTrae(ctx) {
  const sections = [];
  sections.push(`# Project Rules\n`);

  if (ctx.rules) {
    sections.push(`## Coding\n${ctx.rules.coding}\n\n## General\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Ollama (Modelfile SYSTEM prompt) ----
function compileForOllama(ctx) {
  const sysLines = [];

  if (ctx.rules) {
    sysLines.push(`Coding rules: ${ctx.rules.coding}`);
    sysLines.push(`General rules: ${ctx.rules.general}`);
    if (ctx.rules.soul) sysLines.push(`Personality: ${ctx.rules.soul}`);
  }

  if (ctx.activeSkills.length) {
    sysLines.push(`\nActive skills: ${ctx.activeSkills.map(s => s.id).join(', ')}`);
  }

  const systemPrompt = sysLines.join('\n');
  return `# Modelfile — generated by Context Engine
# Usage: ollama create mymodel -f Modelfile.context
# Then merge with your base: FROM llama3.2

SYSTEM """
${systemPrompt}
"""
`;
}

// ---- Kimi K2 (system prompt export) ----
function compileForKimi(ctx) {
  const sections = [];
  sections.push(`You are an AI coding assistant configured by Context Engine.\n`);

  if (ctx.rules) {
    sections.push(`## Rules\nCoding: ${ctx.rules.coding}\nGeneral: ${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map(s => `- ${s.id}: ${s.desc}`).join('\n');
    sections.push(`## Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

// ---- Amp / Sourcegraph (.ampcoderc) ----
function compileForAmp(ctx) {
  const sections = [];
  sections.push(`# Project Instructions\n> Generated by Context Engine.\n`);
  if (ctx.rules) {
    sections.push(`## Rules\n${ctx.rules.coding}\n\n${ctx.rules.general}`);
  }
  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }
  if (ctx.activeSkills.length) {
    sections.push(`## Skills\n${ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

// ---- Devin (devin.md) ----
function compileForDevin(ctx) {
  const sections = [];
  sections.push(`# Devin Project Guide\n> Auto-generated by Context Engine.\n`);
  if (ctx.rules) {
    sections.push(`## Coding Standards\n${ctx.rules.coding}\n\n## General\n${ctx.rules.general}`);
  }
  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map(e => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }
  if (ctx.activeSkills.length) {
    sections.push(`## Skills\n${ctx.activeSkills.map(s => `- **${s.id}**: ${s.desc}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

// ---- Goose / Block (.goosehints) ----
function compileForGoose(ctx) {
  const sections = [];
  sections.push(`# Project Hints\n> Generated by Context Engine.\n`);
  if (ctx.rules) {
    sections.push(`${ctx.rules.coding}\n\n${ctx.rules.general}`);
  }
  if (ctx.activeSkills.length) {
    sections.push(`## Skills\n${ctx.activeSkills.map(s => `- ${s.id}: ${s.desc}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

// ---- Void (.void/rules.md) ----
function compileForVoid(ctx) {
  return compileForContinue(ctx); // Same markdown rules format
}

// ---- Augment (.augment/instructions.md) ----
function compileForAugment(ctx) {
  return compileForContinue(ctx); // Standard markdown instructions
}

// ---- PearAI (.pearai/rules.md) ----
function compileForPearAI(ctx) {
  return compileForCline(ctx); // Cline-based fork, same format
}

// ---- COMPILER CORE ----

const ADAPTERS = {
  claude:       { fn: compileForClaude,       filename: 'CLAUDE.md' },
  cursor:       { fn: compileForCursor,       filename: '.cursorrules' },
  agents:       { fn: compileForAgentsMd,     filename: 'AGENTS.md' },
  copilot:      { fn: compileForCopilot,      filename: '.github/copilot-instructions.md' },
  windsurf:     { fn: compileForWindsurf,     filename: '.windsurfrules' },
  antigravity:  { fn: compileForAntigravity,  filename: 'GEMINI.md' },
  kiro:         { fn: compileForKiro,         filename: '.kiro/steering.md' },
  cline:        { fn: compileForCline,        filename: '.clinerules/context-engine.md' },
  aider:        { fn: compileForAider,        filename: 'CONVENTIONS.md' },
  continue:     { fn: compileForContinue,     filename: '.continue/rules/context-engine.md' },
  zed:          { fn: compileForZed,          filename: '.rules' },
  junie:        { fn: compileForJunie,        filename: '.junie/guidelines.md' },
  trae:         { fn: compileForTrae,         filename: '.trae/rules/context-engine.md' },
  amp:          { fn: compileForAmp,           filename: '.ampcoderc' },
  devin:        { fn: compileForDevin,        filename: 'devin.md' },
  goose:        { fn: compileForGoose,        filename: '.goosehints' },
  void:         { fn: compileForVoid,         filename: '.void/rules.md' },
  augment:      { fn: compileForAugment,      filename: '.augment/instructions.md' },
  pearai:       { fn: compileForPearAI,       filename: '.pearai/rules.md' },
  ollama:       { fn: compileForOllama,       filename: 'Modelfile.context' },
  kimi:         { fn: compileForKimi,         filename: '.kimi-system-prompt.md' },
};

/**
 * Build the shared context object from data files and skill directories.
 * @param {object} opts - { dataDir, skillsDir, scanSkills() }
 */
function buildContext(opts) {
  const { dataDir, scanSkills } = opts;

  const readJSON = f => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch { return null; } };

  const memory   = readJSON('memory.json');
  const rules    = readJSON('rules.json');
  const states   = readJSON('skill-states.json');
  const stateMap = (states && states.states) || states || {};

  const SKILL_MAP = scanSkills();
  const allSkills = Object.values(SKILL_MAP);
  const activeSkills = allSkills.filter(s => stateMap[s.id] !== false);

  // Read skill file content for formats that inline it
  activeSkills.forEach(s => {
    try { s.skillContent = fs.readFileSync(s.path, 'utf8'); }
    catch { s.skillContent = ''; }
  });

  return {
    memory,
    rules: rules ? { coding: rules.coding || '', general: rules.general || '', soul: rules.soul || '' } : null,
    activeSkills,
    totalSkills: allSkills.length,
  };
}

/**
 * Compile context into one or more target formats.
 * @param {object} opts - { dataDir, skillsDir, scanSkills, targets: string[], outputDir? }
 * @returns {{ results: { [target]: { content, filename, tokens } }, errors: string[] }}
 */
function compile(opts) {
  const { targets = Object.keys(ADAPTERS), outputDir } = opts;
  const ctx = buildContext(opts);
  const results = {};
  const errors = [];

  for (const target of targets) {
    const adapter = ADAPTERS[target];
    if (!adapter) { errors.push(`Unknown target: ${target}`); continue; }
    try {
      const content = adapter.fn(ctx);
      const tokens = estimateTokens(content);
      results[target] = { content, filename: adapter.filename, tokens };

      if (outputDir) {
        const outPath = path.join(outputDir, adapter.filename);
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, content, 'utf8');
      }
    } catch (e) {
      errors.push(`${target}: ${e.message}`);
    }
  }

  return { results, errors, context: { activeSkills: ctx.activeSkills.length, totalSkills: ctx.totalSkills } };
}

/**
 * Simple token estimator — word-based heuristic, more accurate than chars/4.
 */
function estimateTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).join('').length;
  const proseChars = text.length - codeBlocks;
  // Prose: ~1.3 tokens/word, Code: ~1.5 tokens/word (higher token density)
  const proseWords = Math.round(proseChars / 5); // avg word length
  const codeWords = Math.round(codeBlocks / 4);
  const mdMarkers = (text.match(/[#|*\->`\[\](){}]/g) || []).length;
  return Math.round(proseWords * 1.3 + codeWords * 1.5 + mdMarkers * 0.5);
}

function getAvailableTargets() {
  return Object.entries(ADAPTERS).map(([id, a]) => ({ id, filename: a.filename }));
}

module.exports = { compile, buildContext, estimateTokens, getAvailableTargets, detectTools, compileToGlobal, ADAPTERS, TOOL_REGISTRY };
