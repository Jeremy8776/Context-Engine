// @ts-check

const fs = require('fs');
const path = require('path');
const { DATA_DIR, SKILLS_DIR } = require('./config');
const { embedTexts, DEFAULT_EMBED_MODEL } = require('./embeddings');
const { loadVectorStore, searchVectors } = require('./vectorstore');
const { compile, buildContext, estimateTokens, ADAPTERS } = require('../compiler');

/**
 * @typedef {{ task: string, targets?: string[], maxTokens?: number, projectPath?: string }} SmartCompileInput
 * @typedef {{ skillId: string, score: number, hits: number, sections: string[] }} SmartSkillMatch
 */

/**
 * @param {SmartCompileInput} input
 * @param {{ scanSkills: () => Record<string, any> }} deps
 */
async function smartCompile(input, deps) {
  const task = String(input.task || '').trim();
  if (!task) return { ok: false, error: 'task is required', status: 400 };
  const store = loadVectorStore();
  if (!store.records.length)
    return { ok: false, error: 'Index is empty. Run /api/index first.', status: 400 };

  const stack = detectProjectStack(input.projectPath || '');
  const query = [task, stack.summary].filter(Boolean).join('\n');
  const embedded = await embedTexts([query], { model: store.model || DEFAULT_EMBED_MODEL });
  if (!embedded.ok) return { ok: false, error: embedded.error, model: embedded.model, status: 503 };

  const matches = searchVectors(store, embedded.vectors[0] || [], { limit: 60 });
  const rankedSkills = rankSkillMatches(matches);
  const selectedSkillIds = fitSkillsToBudget(rankedSkills, input, deps);
  const result = compile({
    dataDir: DATA_DIR,
    skillsDir: SKILLS_DIR,
    scanSkills: deps.scanSkills,
    targets: input.targets?.length ? input.targets : undefined,
    selectedSkillIds,
  });
  const allOn = estimateAllOn(input, deps);
  const selectedTokens = Object.values(result.results || {}).reduce(
    (sum, item) => sum + (Number(item.tokens) || 0),
    0,
  );

  return {
    ok: true,
    task,
    stack,
    selectedSkillIds,
    matches: rankedSkills.slice(0, 12),
    budget: {
      maxTokens: input.maxTokens || 32000,
      selectedTokens,
      allOnTokens: allOn.tokens,
      savedTokens: Math.max(0, allOn.tokens - selectedTokens),
    },
    ...result,
  };
}

/**
 * @param {Array<import('./vectorstore').VectorRecord & { score: number }>} matches
 * @returns {SmartSkillMatch[]}
 */
function rankSkillMatches(matches) {
  /** @type {Map<string, SmartSkillMatch>} */
  const bySkill = new Map();
  matches.forEach((match) => {
    const item = bySkill.get(match.skillId) || { skillId: match.skillId, score: 0, hits: 0, sections: [] };
    item.score = Math.max(item.score, match.score || 0);
    item.hits += 1;
    if (!item.sections.includes(match.section)) item.sections.push(match.section);
    bySkill.set(match.skillId, item);
  });
  return [...bySkill.values()].sort(
    (a, b) => b.score - a.score || b.hits - a.hits || a.skillId.localeCompare(b.skillId),
  );
}

/**
 * @param {SmartSkillMatch[]} rankedSkills
 * @param {SmartCompileInput} input
 * @param {{ scanSkills: () => Record<string, any> }} deps
 */
function fitSkillsToBudget(rankedSkills, input, deps) {
  const maxTokens = input.maxTokens || 32000;
  const targets = input.targets?.length ? input.targets : ['agents'];
  const selected = [];
  for (const match of rankedSkills) {
    selected.push(match.skillId);
    const tokens = previewTokens(selected, targets, deps);
    if (tokens > maxTokens && selected.length > 1) {
      selected.pop();
      break;
    }
  }
  return selected.length ? selected : rankedSkills.slice(0, 1).map((match) => match.skillId);
}

/**
 * @param {string[]} selectedSkillIds
 * @param {string[]} targets
 * @param {{ scanSkills: () => Record<string, any> }} deps
 */
function previewTokens(selectedSkillIds, targets, deps) {
  const ctx = buildContext({
    dataDir: DATA_DIR,
    skillsDir: SKILLS_DIR,
    scanSkills: deps.scanSkills,
    selectedSkillIds,
  });
  return targets.reduce((sum, target) => {
    const adapters = /** @type {Record<string, { fn: (ctx: any) => string }>} */ (ADAPTERS);
    const adapter = adapters[target === 'codex' ? 'agents' : target] || adapters.agents;
    if (!adapter) return sum;
    return sum + estimateTokens(adapter.fn(ctx));
  }, 0);
}

/**
 * @param {SmartCompileInput} input
 * @param {{ scanSkills: () => Record<string, any> }} deps
 */
function estimateAllOn(input, deps) {
  const allSkillIds = Object.keys(deps.scanSkills());
  const targets = input.targets?.length ? input.targets : ['agents'];
  return { tokens: previewTokens(allSkillIds, targets, deps), skills: allSkillIds.length };
}

/** @param {string} projectPath */
function detectProjectStack(projectPath) {
  const root = projectPath ? path.resolve(projectPath) : '';
  const tags = new Set();
  if (root && fs.existsSync(path.join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      Object.keys(deps).forEach((name) => {
        if (/react|next|vite|electron|typescript|eslint|playwright|tailwind|supabase|stripe/i.test(name)) {
          tags.add(name.replace(/^@[^/]+\//, ''));
        }
      });
    } catch {
      // tolerate unreadable or invalid package.json — stack detection is best-effort
    }
  }
  if (root && fs.existsSync(path.join(root, 'README.md'))) {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').slice(0, 4000);
    ['React', 'Electron', 'MCP', 'TypeScript', 'Node', 'Python'].forEach((term) => {
      if (new RegExp(`\\b${term}\\b`, 'i').test(readme)) tags.add(term.toLowerCase());
    });
  }
  const list = [...tags].sort();
  return {
    projectPath: root || null,
    tags: list,
    summary: list.length ? `Project stack signals: ${list.join(', ')}` : '',
  };
}

module.exports = { smartCompile, detectProjectStack, rankSkillMatches };
