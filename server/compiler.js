// compiler.js — Cross-tool Context Compiler
// Generates context files for 15 AI tools from a single source of truth

const fs   = require('fs');
const path = require('path');

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

module.exports = { compile, buildContext, estimateTokens, getAvailableTargets, ADAPTERS };
