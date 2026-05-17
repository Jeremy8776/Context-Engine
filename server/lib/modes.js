// @ts-check

// modes.js — Mode presets, CONTEXT.md generation, and budget estimation

const fs = require('fs');
const { DATA_DIR, SKILLS_DIR, CONTEXT_MD, MODES_FILE } = require('./config');
const { readData, writeData, appendSession } = require('./backup');
const { scanSkills } = require('./skills');
const { estimateTokens, buildContext, ADAPTERS } = require('../compiler');

const DEFAULT_MODES = {
  modes: [
    {
      id: 'all',
      label: 'All On',
      icon: 'unlock',
      desc: 'Activate all discovered skills for maximum capability.',
      skills: [],
    },
    {
      id: 'coding',
      label: 'Heavy Coding',
      icon: 'code',
      desc: 'Optimized for complex refactoring and library development.',
      skills: [],
    },
    {
      id: 'minimal',
      label: 'Lean Mode',
      icon: 'shield',
      desc: 'Minimal context for faster inference and lower token usage.',
      skills: [],
    },
  ],
};

function getModes() {
  try {
    return JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));
  } catch {
    return DEFAULT_MODES;
  }
}

function regenerateCONTEXTmd() {
  scanSkills(true); // bust cache
  const ctx = buildContext({ dataDir: DATA_DIR, skillsDir: SKILLS_DIR, scanSkills });
  fs.writeFileSync(CONTEXT_MD, ADAPTERS.claude.fn(ctx), 'utf8');
  return { activeCount: ctx.activeSkills.length, total: ctx.totalSkills };
}

/** @param {string} modeId */
function applyMode(modeId) {
  const SKILL_MAP = scanSkills();
  const modesData = getModes();
  /** @type {{ id: string, skills: string[] } | undefined} */
  const mode = modesData.modes.find((/** @type {{ id: string }} */ m) => m.id === modeId);
  if (!mode) return null;
  const backup = readData('skill-states.json');
  const states = backup || {};
  /** @type {Record<string, boolean>} */
  const stateMap = { ...(states.states || {}) };

  // Ensure every discovered skill has an entry in the state map.
  // New skills default to active so they remain visible and available.
  Object.keys(SKILL_MAP).forEach((/** @type {string} */ id) => {
    if (!(id in stateMap)) stateMap[id] = true;
  });

  if (mode.id === 'all') {
    Object.keys(SKILL_MAP).forEach((/** @type {string} */ id) => {
      stateMap[id] = true;
    });
  } else if (mode.skills.length > 0) {
    // Only activate skills the mode explicitly lists; leave all others at
    // their current state so skills never disappear when a mode is applied.
    mode.skills.forEach((/** @type {string} */ id) => {
      if (SKILL_MAP[id]) stateMap[id] = true;
    });
  }

  const newStates = {
    version: '1.0',
    last_updated: new Date().toISOString().split('T')[0],
    states: stateMap,
  };
  try {
    writeData('skill-states.json', newStates);
    const regen = regenerateCONTEXTmd();
    appendSession({
      type: 'mode_applied',
      mode: modeId,
      skills: Object.keys(stateMap).filter((k) => stateMap[k]),
    });
    return newStates;
  } catch (e) {
    // Rollback both state file and CONTEXT.md on failure
    if (backup) {
      writeData('skill-states.json', backup);
      try {
        regenerateCONTEXTmd();
      } catch {}
    }
    throw e;
  }
}

function estimateContextBudget() {
  try {
    const contextMd = fs.existsSync(CONTEXT_MD) ? fs.readFileSync(CONTEXT_MD, 'utf8') : '';
    const memText = JSON.stringify(readData('memory.json') || '');
    const rulesText = JSON.stringify(readData('rules.json') || '');
    const contextTokens = estimateTokens(contextMd);
    const memoryTokens = estimateTokens(memText);
    const rulesTokens = estimateTokens(rulesText);
    const totalTokens = contextTokens + memoryTokens + rulesTokens;
    return {
      contextMdChars: contextMd.length,
      memoryChars: memText.length,
      rulesChars: rulesText.length,
      totalChars: contextMd.length + memText.length + rulesText.length,
      estimatedTokens: totalTokens,
      budgetPercent: Math.round((totalTokens / 200000) * 100),
      contextMdLines: contextMd.split('\n').length,
      breakdown: {
        context: { chars: contextMd.length, tokens: contextTokens },
        memory: { chars: memText.length, tokens: memoryTokens },
        rules: { chars: rulesText.length, tokens: rulesTokens },
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = { DEFAULT_MODES, getModes, regenerateCONTEXTmd, applyMode, estimateContextBudget };