// onboarding.js -- First-run discovery and setup state.

const fs = require('fs');
const { DATA_DIR, SESSION_LOG } = require('./config');
const { readData, writeData } = require('./backup');
const { scanSkills } = require('./skills');
const { loadVectorStore } = require('./vectorstore');
const { buildHostConfigs } = require('./mcp-host-config');

const ONBOARDING_FILE = 'onboarding.json';

function readOnboarding() {
  return readData(ONBOARDING_FILE);
}

function readStatesMap() {
  const data = readData('skill-states.json');
  return data?.states || data || {};
}

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

function getOnboardingSummary() {
  const state = readOnboarding();
  const hosts = buildHostConfigs();
  return {
    shouldShow: shouldShowOnboarding(state),
    state: state || { version: 1, completedAt: null },
    context: getContextSummary(),
    hosts,
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
