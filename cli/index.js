#!/usr/bin/env node
// Context Engine CLI — compile AI context across tools

const fs   = require('fs');
const path = require('path');

const COMMANDS = { init, compile, status, add, remove, help };
const args = process.argv.slice(2);
const cmd  = args[0];

if (!cmd || cmd === '--help' || cmd === '-h') help();
else if (COMMANDS[cmd]) COMMANDS[cmd](args.slice(1));
else { console.error(`Unknown command: ${cmd}\nRun 'context-engine help' for usage.`); process.exit(1); }

// ---- HELPERS ----

function loadConfig(dir) {
  const cfgPath = path.join(dir || process.cwd(), 'context-engine.json');
  if (!fs.existsSync(cfgPath)) return null;
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function resolveRoot(flagDir) {
  // Walk up from CWD looking for context-engine.json
  let dir = flagDir || process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'context-engine.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function scanSkills(skillsDir) {
  const map = {};
  if (!fs.existsSync(skillsDir)) return map;
  const scan = (dir, cat = 'Uncategorized') => {
    fs.readdirSync(dir).forEach(item => {
      const full = path.join(dir, item);
      if (!fs.statSync(full).isDirectory()) return;
      const skillFile = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const descMatch = content.match(/# (.*?)\n(.*?)\n/);
        map[item] = {
          id: item, cat, type: 'custom', path: skillFile,
          relativePath: path.relative(process.cwd(), skillFile).replace(/\\/g, '/'),
          desc: descMatch ? descMatch[2].trim() : 'No description',
          triggers: []
        };
      } else {
        scan(full, item);
      }
    });
  };
  scan(skillsDir);
  return map;
}

// ---- COMMANDS ----

function init(args) {
  const dir = args[0] || process.cwd();
  const cfgPath = path.join(dir, 'context-engine.json');

  if (fs.existsSync(cfgPath)) {
    console.log('Context Engine already initialized in this directory.');
    return;
  }

  const config = {
    version: '1.0',
    port: 3847,
    targets: ['claude', 'cursor', 'agents'],
    dataDir: './data',
    skillsDir: './skills',
  };

  // Create directories
  const dataDir = path.join(dir, 'data');
  const skillsDir = path.join(dir, 'skills');
  const exampleDir = path.join(skillsDir, 'example-skill');

  [dataDir, skillsDir, exampleDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // Write config
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');

  // Write template data files
  fs.writeFileSync(path.join(dataDir, 'memory.json'), JSON.stringify({
    version: '1.1', last_updated: new Date().toISOString().split('T')[0],
    entries: [{ id: 'entry_1', category: 'general', label: '', content: 'Example memory entry — edit or replace this.' }]
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(dataDir, 'rules.json'), JSON.stringify({
    version: '1.0', last_updated: new Date().toISOString().split('T')[0],
    coding: 'Modular code files. Comment the why, not the what.',
    general: 'Think independently. Be concise.',
    soul: 'Helpful, logical, and direct.'
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(dataDir, 'skill-states.json'), JSON.stringify({
    version: '1.0', last_updated: new Date().toISOString().split('T')[0],
    states: { 'example-skill': true }
  }, null, 2), 'utf8');

  // Write example skill
  fs.writeFileSync(path.join(exampleDir, 'SKILL.md'), `---
name: example-skill
description: An example skill to demonstrate the Context Engine format
---

# Example Skill
This is a template skill. Replace this with your own instructions.

## When to use
- Use this skill when the user asks for examples

## Instructions
- Be helpful and concise
- Follow the project's coding conventions
`, 'utf8');

  console.log(`
  Context Engine initialized!

  Created:
    context-engine.json    Config file
    data/memory.json       Memory store
    data/rules.json        Rules & personality
    data/skill-states.json Skill toggle states
    skills/example-skill/  Example skill

  Next steps:
    context-engine compile   Compile context files
    context-engine status    View current state
    context-engine add       Add a new skill
  `);
}

function compile(args) {
  const root = resolveRoot();
  if (!root) { console.error('No context-engine.json found. Run "context-engine init" first.'); process.exit(1); }

  const config = loadConfig(root);
  const dataDir = path.resolve(root, config.dataDir || './data');
  const skillsDir = path.resolve(root, config.skillsDir || './skills');

  // Parse flags
  let targets = config.targets || ['claude', 'cursor', 'agents'];
  let outputDir = root;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--targets' && args[i+1]) { targets = args[++i].split(','); }
    if (args[i] === '--output' && args[i+1])  { outputDir = path.resolve(args[++i]); }
  }

  const { compile: compilerFn } = require(path.join(__dirname, '..', 'server', 'compiler'));
  const result = compilerFn({
    dataDir,
    skillsDir,
    scanSkills: () => scanSkills(skillsDir),
    targets,
    outputDir,
  });

  if (result.errors.length) {
    result.errors.forEach(e => console.error(`  Error: ${e}`));
  }

  console.log(`\n  Compiled ${Object.keys(result.results).length} target(s):\n`);
  for (const [target, r] of Object.entries(result.results)) {
    const outPath = path.join(outputDir, r.filename);
    console.log(`    ${r.filename.padEnd(40)} ~${r.tokens.toLocaleString()} tokens`);
  }
  console.log(`\n  Active skills: ${result.context.activeSkills}/${result.context.totalSkills}`);
  console.log(`  Output: ${outputDir}\n`);
}

function status(args) {
  const root = resolveRoot();
  if (!root) { console.error('No context-engine.json found. Run "context-engine init" first.'); process.exit(1); }

  const config = loadConfig(root);
  const dataDir = path.resolve(root, config.dataDir || './data');
  const skillsDir = path.resolve(root, config.skillsDir || './skills');

  const readJSON = f => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch { return null; } };

  const memory = readJSON('memory.json');
  const rules  = readJSON('rules.json');
  const states = readJSON('skill-states.json');
  const stateMap = (states && states.states) || {};
  const skills = scanSkills(skillsDir);
  const allIds = Object.keys(skills);
  const activeIds = allIds.filter(id => stateMap[id] !== false);

  console.log(`\n  Context Engine Status\n`);
  console.log(`  Root:     ${root}`);
  console.log(`  Skills:   ${activeIds.length}/${allIds.length} active`);
  console.log(`  Memory:   ${(memory && memory.entries) ? memory.entries.length : 0} entries`);
  console.log(`  Rules:    ${rules ? 'configured' : 'not found'}`);
  console.log(`  Targets:  ${(config.targets || []).join(', ')}`);

  // Check which compiled files exist
  const targets = config.targets || ['claude', 'cursor', 'agents'];
  const { ADAPTERS } = require(path.join(__dirname, '..', 'server', 'compiler'));
  console.log(`\n  Compiled files:`);
  for (const t of targets) {
    const adapter = ADAPTERS[t];
    if (!adapter) continue;
    const fpath = path.join(root, adapter.filename);
    if (fs.existsSync(fpath)) {
      const stat = fs.statSync(fpath);
      const age = Math.floor((Date.now() - stat.mtimeMs) / 60000);
      const ageStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age/60)}h ago` : `${Math.floor(age/1440)}d ago`;
      console.log(`    ${adapter.filename.padEnd(40)} ${ageStr}`);
    } else {
      console.log(`    ${adapter.filename.padEnd(40)} (not compiled yet)`);
    }
  }

  if (allIds.length) {
    console.log(`\n  Skills:`);
    allIds.forEach(id => {
      const active = stateMap[id] !== false;
      console.log(`    ${active ? '+' : '-'} ${id}`);
    });
  }
  console.log('');
}

function add(args) {
  const root = resolveRoot();
  if (!root) { console.error('No context-engine.json found. Run "context-engine init" first.'); process.exit(1); }

  const config = loadConfig(root);
  const skillsDir = path.resolve(root, config.skillsDir || './skills');
  const dataDir = path.resolve(root, config.dataDir || './data');
  const source = args[0];

  if (!source) { console.error('Usage: context-engine add <path-to-skill-dir-or-skill.md>'); process.exit(1); }

  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) { console.error(`Not found: ${sourcePath}`); process.exit(1); }

  const stat = fs.statSync(sourcePath);
  let skillId, destDir;

  if (stat.isDirectory()) {
    // Copy entire directory
    skillId = path.basename(sourcePath);
    destDir = path.join(skillsDir, skillId);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    // Copy SKILL.md
    const skillFile = path.join(sourcePath, 'SKILL.md');
    if (!fs.existsSync(skillFile)) { console.error(`No SKILL.md found in ${sourcePath}`); process.exit(1); }
    fs.copyFileSync(skillFile, path.join(destDir, 'SKILL.md'));
  } else {
    // Single .md file
    skillId = path.basename(sourcePath, '.md').replace(/^SKILL$/, path.basename(path.dirname(sourcePath)));
    destDir = path.join(skillsDir, skillId);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(destDir, 'SKILL.md'));
  }

  // Enable the skill in states
  const statesPath = path.join(dataDir, 'skill-states.json');
  const states = fs.existsSync(statesPath) ? JSON.parse(fs.readFileSync(statesPath, 'utf8')) : { version: '1.0', states: {} };
  if (!states.states) states.states = {};
  states.states[skillId] = true;
  states.last_updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(statesPath, JSON.stringify(states, null, 2), 'utf8');

  console.log(`\n  Added skill: ${skillId}`);
  console.log(`  Location: ${destDir}`);
  console.log(`  State: enabled\n`);
}

function remove(args) {
  const root = resolveRoot();
  if (!root) { console.error('No context-engine.json found. Run "context-engine init" first.'); process.exit(1); }

  const config = loadConfig(root);
  const skillsDir = path.resolve(root, config.skillsDir || './skills');
  const dataDir = path.resolve(root, config.dataDir || './data');
  const skillId = args[0];
  const deleteFiles = args.includes('--delete');

  if (!skillId) { console.error('Usage: context-engine remove <skill-id> [--delete]'); process.exit(1); }

  // Remove from states
  const statesPath = path.join(dataDir, 'skill-states.json');
  if (fs.existsSync(statesPath)) {
    const states = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
    if (states.states) {
      delete states.states[skillId];
      states.last_updated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(statesPath, JSON.stringify(states, null, 2), 'utf8');
    }
  }

  // Optionally delete files
  if (deleteFiles) {
    const skillDir = path.join(skillsDir, skillId);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
      console.log(`\n  Removed skill: ${skillId} (files deleted)`);
    } else {
      console.log(`\n  Removed skill state: ${skillId} (directory not found)`);
    }
  } else {
    console.log(`\n  Disabled skill: ${skillId} (files kept — use --delete to remove)`);
  }
  console.log('');
}

function help() {
  console.log(`
  Context Engine CLI — Cross-tool AI context compiler

  Usage: context-engine <command> [options]

  Commands:
    init                     Initialize Context Engine in current directory
    compile                  Compile context files for all configured targets
      --targets claude,cursor  Compile specific targets only
      --output ./dist          Output to a different directory
    status                   Show current configuration and skill states
    add <path>               Add a skill from a local directory or .md file
    remove <id> [--delete]   Disable (or delete) a skill by ID
    help                     Show this help message

  Compile targets:
    claude      CLAUDE.md (Claude Code)
    cursor      .cursorrules (Cursor IDE)
    agents      AGENTS.md (AAIF universal standard)
    copilot     .github/copilot-instructions.md (GitHub Copilot)
    windsurf    .windsurfrules (Windsurf IDE)

  Examples:
    context-engine init
    context-engine compile
    context-engine compile --targets claude,cursor
    context-engine add ./my-skills/react-rules
    context-engine status
  `);
}
