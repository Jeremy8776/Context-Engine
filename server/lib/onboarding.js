// @ts-check

// onboarding.js -- First-run discovery and setup state.

const fs = require('fs');
const { DATA_DIR, SESSION_LOG } = require('./config');
const { readData, writeData } = require('./backup');
const { scanSkills } = require('./skills');
const { loadVectorStore, getIndexStale } = require('./vectorstore');
const { buildHostConfigs } = require('./mcp-host-config');

const ONBOARDING_FILE = 'onboarding.json';

function readOnboarding() {
  return readData(ONBOARDING_FILE);
}

function readStatesMap() {
  const data = readData('skill-states.json');
  return data?.states || data || {};
}

/**
 * @param {Array<{ id: string, type?: string }>} skills
 * @param {Record<string, boolean>} states
 */
function countActiveSkills(skills, states) {
  return skills.filter((skill) => {
    if (Object.prototype.hasOwnProperty.call(states, skill.id)) return !!states[skill.id];
    return skill.type !== 'external';
  }).length;
}

function hasSessionHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_LOG, 'utf8'));
    return Array.isArray(data?.sessions) && data.sessions.length > 0;
  } catch {
    return false;
  }
}

/** @param {{ completedAt?: string, dismissedAt?: string, show?: boolean } | null | undefined} state */
function shouldShowOnboarding(state) {
  if (state?.completedAt) return false;
  if (state?.dismissedAt) return false;
  if (process.env.CE_NEW_USER_PROFILE === '1') return true;
  if (state?.show === true) return true;
  return !state && !hasSessionHistory();
}

function getContextSummary() {
  const skills = Object.values(scanSkills());
  const states = readStatesMap();
  const memory = readData('memory.json');
  const store = loadVectorStore();
  const skillIds = new Set(store.records.map((record) => record.skillId));
  const stale = getIndexStale();
  return {
    totalSkills: skills.length,
    activeSkills: countActiveSkills(skills, states),
    memoryEntries: Array.isArray(memory?.entries) ? memory.entries.length : 0,
    index: {
      ready: store.records.length > 0,
      chunks: store.records.length,
      skills: skillIds.size,
      model: store.model || null,
      updatedAt: store.updatedAt || null,
      stale: !!stale.stale,
      staleReason: stale.reason || null,
    },
    activeSkillNames: skills
      .filter((skill) => {
        if (Object.prototype.hasOwnProperty.call(states, skill.id)) return !!states[skill.id];
        return skill.type !== 'external';
      })
      .slice(0, 5)
      .map((skill) => skill.name || skill.id),
  };
}

/** @param {Record<string, any>} tools */
function summarizeToolSurfaces(tools = {}) {
  return Object.values(tools)
    .filter((tool) => tool && tool.id)
    .map((tool) => ({
      id: tool.id,
      label: tool.label || tool.id,
      detected: !!tool.detected,
      available: !!tool.available,
      outputReady: !!tool.outputReady,
      projectReady: !!tool.projectReady,
      globalReady: !!tool.globalReady,
      fileStandard: !!tool.fileStandard,
      status: tool.status || 'unknown',
      category: tool.category || 'auto',
      signals: Array.isArray(tool.signals) ? tool.signals.slice(0, 3) : [],
    }))
    .sort((a, b) => {
      const rankA = a.detected ? 0 : a.available ? 1 : 2;
      const rankB = b.detected ? 0 : b.available ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return a.label.localeCompare(b.label);
    });
}

/** @param {{ tools?: Record<string, any> }} [options] */
function getOnboardingSummary(options = {}) {
  const state = readOnboarding();
  const hosts = buildHostConfigs();
  const tools = summarizeToolSurfaces(options.tools || {});
  return {
    shouldShow: shouldShowOnboarding(state),
    state: state || { version: 1, completedAt: null },
    context: getContextSummary(),
    hosts,
    tools,
  };
}

function completeOnboarding() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = {
    version: 1,
    completedAt: new Date().toISOString(),
  };
  writeData(ONBOARDING_FILE, state);
  return { ok: true, state };
}

function resetOnboarding() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = {
    version: 1,
    show: true,
    resetAt: new Date().toISOString(),
  };
  writeData(ONBOARDING_FILE, state);
  return { ok: true, state };
}

module.exports = {
  getOnboardingSummary,
  completeOnboarding,
  resetOnboarding,
};
