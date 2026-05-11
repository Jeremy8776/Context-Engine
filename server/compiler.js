// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// compiler.js — Cross-tool Context Compiler
// Generates context files for 22 AI tools from a single source of truth

const fs = require('fs');
const path = require('path');
const os = require('os');
const { GENERIC_CONFIGS, GENERIC_FILENAMES } = require('./lib/compiler-generic-configs');
const { TOOL_REGISTRY } = require('./lib/tool-registry');

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
    if (!reg || !reg.globalPath) {
      errors.push(`${target}: no global path`);
      continue;
    }

    // Codex uses AGENTS.md format for its instructions.md
    const adapterId = target === 'codex' ? 'agents' : target;
    const adapter = ADAPTERS[adapterId];
    if (!adapter) {
      errors.push(`${target}: no adapter`);
      continue;
    }

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

  return {
    ok: true,
    installed,
    errors,
    context: { activeSkills: ctx.activeSkills.length, totalSkills: ctx.totalSkills },
  };
}

// ---- FORMAT ADAPTERS ----

function compileForClaude(ctx) {
  const now = new Date().toISOString().split('T')[0];
  const skillTable = ctx.activeSkills
    .map((s) => {
      const relPath = s.relativePath || s.path;
      return `| ${(s.cat || 'Uncategorized').padEnd(28)} | ${relPath} |`;
    })
    .join('\n');

  const rulesBlock = ctx.rules
    ? `## Operational Rules\n- **Coding:** ${ctx.rules.coding}\n- **General:** ${ctx.rules.general}\n- **Soul:** ${ctx.rules.soul}\n`
    : '';
  const resume = sessionStartBlock(ctx);

  return `# System Context
> Auto-loaded by AI Agent. Last updated: ${now}.
> Active skills: ${ctx.activeSkills.length}/${ctx.totalSkills}. Compiled by Context Engine.

---
${resume ? `\n${resume}\n\n---\n` : ''}
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
  const resume = sessionStartBlock(ctx);
  if (resume) sections.push(resume);

  if (ctx.rules) {
    sections.push(
      `# Rules\n\n## Coding\n${ctx.rules.coding}\n\n## General\n${ctx.rules.general}\n\n## Personality\n${ctx.rules.soul}`,
    );
  }

  if (ctx.memory && ctx.memory.entries && ctx.memory.entries.length) {
    const memLines = ctx.memory.entries.map((e) => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`# Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills
      .map((s) => {
        let content = '';
        if (s.skillContent) {
          // Strip YAML frontmatter for Cursor (it doesn't use it)
          content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
          // Cursor works best with concise rules, take first 2000 chars per skill
          if (content.length > 2000) content = content.slice(0, 2000) + '\n...(truncated)';
        }
        return `## ${s.id}\n${s.desc}\n${content ? '\n' + content : ''}`;
      })
      .join('\n\n');
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

  const resume = sessionStartBlock(ctx);
  if (resume) sections.push(resume);

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
    const memLines = ctx.memory.entries.map((e) => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
    sections.push(`## Context\n${memLines}`);
  }

  if (ctx.activeSkills.length) {
    const skillList = ctx.activeSkills.map((s) => `- **${s.id}**: ${s.desc}`).join('\n');
    sections.push(`## Skills\n${skillList}`);
  }

  return sections.join('\n\n');
}

function compileForCopilot(ctx) {
  const sections = [];
  const resume = sessionStartBlock(ctx);
  if (resume) sections.push(resume);

  if (ctx.rules) {
    sections.push(`# Instructions\n\n${ctx.rules.coding}\n\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillRules = ctx.activeSkills
      .map((s) => {
        let content = s.desc;
        if (s.skillContent) {
          content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
          if (content.length > 1500) content = content.slice(0, 1500) + '\n...(truncated)';
        }
        return `## ${s.id}\n${content}`;
      })
      .join('\n\n');
    sections.push(skillRules);
  }

  return sections.join('\n\n');
}

function compileForWindsurf(ctx) {
  // Windsurf format is similar to Cursor — flat text rules
  const sections = [];
  const resume = sessionStartBlock(ctx);
  if (resume) sections.push(resume);

  if (ctx.rules) {
    sections.push(`# Rules\n${ctx.rules.coding}\n${ctx.rules.general}`);
  }

  if (ctx.activeSkills.length) {
    const skillBlocks = ctx.activeSkills
      .map((s) => {
        let content = s.desc;
        if (s.skillContent) {
          content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
          if (content.length > 2000) content = content.slice(0, 2000) + '\n...(truncated)';
        }
        return `## ${s.id}\n${content}`;
      })
      .join('\n\n');
    sections.push(`# Skills\n\n${skillBlocks}`);
  }

  return sections.join('\n\n');
}

// ---- Generic templated adapter ----
// Most tools want the same shape (preface + rules + memory + skills) with cosmetic
// differences. One config-driven function replaces 15 near-identical adapters.

function renderMemory(ctx, header) {
  if (!header || !ctx.memory?.entries?.length) return null;
  const lines = ctx.memory.entries.map((e) => `- ${typeof e === 'string' ? e : e.content}`).join('\n');
  return `${header}\n${lines}`;
}

function renderSkills(skills, cfg) {
  if (!skills.length) return null;
  let body;
  switch (cfg.format) {
    case 'list-bold':
      body = skills.map((s) => `- **${s.id}**: ${s.desc}`).join('\n');
      break;
    case 'list-plain':
      body = skills.map((s) => `- ${s.id}: ${s.desc}`).join('\n');
      break;
    case 'h3-list':
      body = skills.map((s) => `### ${s.id}\n${s.desc}`).join('\n\n');
      break;
    case 'h2-content': {
      const max = cfg.contentMax || 2000;
      body = skills
        .map((s) => {
          let content = s.desc;
          if (s.skillContent) {
            content = s.skillContent.replace(/^---[\s\S]*?---\n*/, '').trim();
            if (content.length > max) content = content.slice(0, max) + '\n...(truncated)';
          }
          return `## ${s.id}\n${content}`;
        })
        .join('\n\n');
      break;
    }
    default:
      throw new Error(`Unknown skill format: ${cfg.format}`);
  }
  return cfg.header
    ? `${cfg.header}\n${cfg.format === 'h3-list' || cfg.format === 'h2-content' ? '\n' : ''}${body}`
    : body;
}

function renderRules(rules, cfg) {
  if (!rules || !cfg) return null;
  if (cfg.kind === 'flat') {
    return cfg.keys
      .map((k) => rules[k])
      .filter(Boolean)
      .join('\n\n');
  }
  if (cfg.kind === 'wrapped') {
    const body = cfg.keys
      .map((k) => rules[k])
      .filter(Boolean)
      .join('\n\n');
    return `${cfg.header}\n${body}`;
  }
  if (cfg.kind === 'wrapped-inline') {
    const body = cfg.entries
      .map(([prefix, key]) => (rules[key] ? `${prefix}${rules[key]}` : null))
      .filter(Boolean)
      .join('\n');
    return `${cfg.header}\n${body}`;
  }
  if (cfg.kind === 'sections') {
    return cfg.entries
      .map(([heading, key]) => (rules[key] ? `## ${heading}\n${rules[key]}` : null))
      .filter(Boolean)
      .join('\n\n');
  }
  if (cfg.kind === 'split-sections') {
    // Each entry becomes its own top-level section pushed separately.
    return cfg.entries
      .map(([heading, key]) => (rules[key] ? `## ${heading}\n${rules[key]}` : null))
      .filter(Boolean);
  }
  throw new Error(`Unknown rules kind: ${cfg.kind}`);
}

function compileGeneric(ctx, cfg) {
  const sections = [];
  if (cfg.preface) sections.push(cfg.preface);

  const resume = sessionStartBlock(ctx);
  if (resume) sections.push(resume);

  if (ctx.rules && cfg.rules) {
    const r = renderRules(ctx.rules, cfg.rules);
    if (Array.isArray(r)) sections.push(...r);
    else if (r) sections.push(r);
  }

  const mem = renderMemory(ctx, cfg.memoryHeader);
  if (mem) sections.push(mem);

  const sk = renderSkills(ctx.activeSkills, cfg.skills);
  if (sk) sections.push(sk);

  return sections.join('\n\n');
}

// ---- Ollama (Modelfile SYSTEM prompt) — bespoke (Modelfile syntax) ----
function compileForOllama(ctx) {
  const sysLines = [];

  if (ctx.sessionStart) {
    sysLines.push(`Session start: ${ctx.sessionStart}`);
    sysLines.push('');
  }

  if (ctx.rules) {
    sysLines.push(`Coding rules: ${ctx.rules.coding}`);
    sysLines.push(`General rules: ${ctx.rules.general}`);
    if (ctx.rules.soul) sysLines.push(`Personality: ${ctx.rules.soul}`);
  }

  if (ctx.activeSkills.length) {
    sysLines.push(`\nActive skills: ${ctx.activeSkills.map((s) => s.id).join(', ')}`);
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

// ---- COMPILER CORE ----

const BESPOKE_ADAPTERS = {
  claude: { fn: compileForClaude, filename: 'CLAUDE.md' },
  cursor: { fn: compileForCursor, filename: '.cursorrules' },
  agents: { fn: compileForAgentsMd, filename: 'AGENTS.md' },
  codex: { fn: compileForAgentsMd, filename: '.codex/instructions.md' },
  copilot: { fn: compileForCopilot, filename: '.github/copilot-instructions.md' },
  windsurf: { fn: compileForWindsurf, filename: '.windsurfrules' },
  ollama: { fn: compileForOllama, filename: 'Modelfile.context' },
};

const ADAPTERS = { ...BESPOKE_ADAPTERS };
for (const [id, filename] of Object.entries(GENERIC_FILENAMES)) {
  const cfg = GENERIC_CONFIGS[id];
  ADAPTERS[id] = { fn: (ctx) => compileGeneric(ctx, cfg), filename };
}

/**
 * Build the shared context object from data files and skill directories.
 * @param {object} opts - { dataDir, skillsDir, scanSkills() }
 */
function buildContext(opts) {
  const { dataDir, scanSkills } = opts;

  const readJSON = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    } catch {
      return null;
    }
  };

  const memory = readJSON('memory.json');
  const rules = readJSON('rules.json');
  const states = readJSON('skill-states.json');
  const stateMap = (states && states.states) || states || {};

  const SKILL_MAP = scanSkills();
  const allSkills = Object.values(SKILL_MAP);
  const selectedIds = Array.isArray(opts.selectedSkillIds) ? new Set(opts.selectedSkillIds) : null;
  const activeSkills = selectedIds
    ? allSkills.filter((s) => selectedIds.has(s.id))
    : allSkills.filter((s) => stateMap[s.id] !== false);

  // Read skill file content and compute relative paths for output formats
  const skillsDir = opts.skillsDir || path.join(dataDir, '..', 'skills');
  const rootDir = opts.skillsDir ? path.dirname(opts.skillsDir) : path.join(dataDir, '..');
  activeSkills.forEach((s) => {
    try {
      s.skillContent = fs.readFileSync(s.path, 'utf8');
    } catch {
      s.skillContent = '';
    }
    s.relativePath = path.relative(rootDir, s.path).replace(/\\/g, '/');
  });

  return {
    memory,
    rules: rules
      ? { coding: rules.coding || '', general: rules.general || '', soul: rules.soul || '' }
      : null,
    sessionStart: rules?.sessionStart || '',
    activeSkills,
    totalSkills: allSkills.length,
  };
}

// Resume bookmark — same block injected into every adapter so AI agents
// route to the handoff doc before exploring the repo on session resume.
function sessionStartBlock(ctx) {
  if (!ctx.sessionStart) return '';
  return `## Resuming work\n${ctx.sessionStart}`;
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
    if (!adapter) {
      errors.push(`Unknown target: ${target}`);
      continue;
    }
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

  return {
    results,
    errors,
    context: { activeSkills: ctx.activeSkills.length, totalSkills: ctx.totalSkills },
  };
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

module.exports = {
  compile,
  buildContext,
  estimateTokens,
  getAvailableTargets,
  compileToGlobal,
  ADAPTERS,
  TOOL_REGISTRY,
};