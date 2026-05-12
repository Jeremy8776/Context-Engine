// @ts-check

const fs = require('fs');
const path = require('path');
const { body, json } = require('./http');
const { WORKSPACES_FILE } = require('./config');
const { chunkSkill } = require('./chunker');
const { embedTexts, DEFAULT_EMBED_MODEL } = require('./embeddings');
const {
  loadVectorStore,
  saveVectorStore,
  upsertVectors,
  replaceVectors,
  searchVectors,
  clearIndexStale,
  getIndexStale,
} = require('./vectorstore');
const { generateDedupReport, loadDedupReport, saveDedupReport, resolveDedupCluster } = require('./dedup');
const { smartCompile } = require('./smart-compile');

/**
 * Resolve a user-supplied project path against the registered workspaces list.
 * Smart compile only reads package.json + README.md from this path, but the
 * path is still user-controlled — gating it on a previously-registered
 * workspace inherits the existing checkSafeWritePath denylist (system dirs,
 * .ssh, host-app config dirs, browser profile dirs) without re-implementing it
 * here. Returns null if the path is empty (caller skips stack detection) or
 * the canonical workspace path if registered. Throws if the path is set but
 * not a registered workspace.
 *
 * `workspacesFile` is parameterized so smoke tests can point at a fixture
 * without touching the real on-disk workspaces.json.
 * @param {string | undefined} projectPath
 * @param {string} [workspacesFile]
 */
function resolveRegisteredWorkspace(projectPath, workspacesFile = WORKSPACES_FILE) {
  const raw = String(projectPath || '').trim();
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(workspacesFile, 'utf8'));
  } catch {
    data = { workspaces: [] };
  }
  /** @type {Array<{ path?: string }>} */
  const list = Array.isArray(data.workspaces) ? data.workspaces : [];
  const wanted = path.normalize(path.resolve(raw));
  const match = list.find((w) => path.normalize(String(w.path || '')) === wanted);
  if (!match) {
    throw new Error(`projectPath must be a registered workspace. Add it via /api/workspaces first: ${raw}`);
  }
  return match.path;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 * @param {{ scanSkills: () => Record<string, { id: string, path: string }> }} deps
 */
async function handleIntelligenceRequest(req, res, url, deps) {
  const p = url.pathname;

  if (p === '/api/index/status' && req.method === 'GET') {
    const store = loadVectorStore();
    const skillIds = new Set(store.records.map((record) => record.skillId));
    const stale = getIndexStale();
    return json(res, {
      ok: true,
      chunks: store.records.length,
      skills: skillIds.size,
      model: store.model,
      updatedAt: store.updatedAt,
      stale: !!stale.stale,
      staleReason: stale.reason || null,
      staleSince: stale.since || null,
    });
  }

  if (p === '/api/index' && req.method === 'POST') {
    const skills = Object.values(deps.scanSkills());
    const chunks = skills.flatMap((skill) => chunkSkill(skill));
    const embedded = await embedTexts(chunks.map((chunk) => chunk.text));
    if (!embedded.ok) {
      return json(
        res,
        { ok: false, error: embedded.error, chunks: chunks.length, model: embedded.model },
        503,
      );
    }
    const records = chunks.map((chunk, index) => ({ ...chunk, vector: embedded.vectors[index] || [] }));
    const store = replaceVectors(records, embedded.model || DEFAULT_EMBED_MODEL);
    saveVectorStore(store);
    // Full rebuild clears the stale flag — the index now reflects the current
    // skill set as walked by scanSkills across every registered source.
    clearIndexStale();
    return json(res, {
      ok: true,
      chunks: store.records.length,
      skills: skills.length,
      model: store.model,
      updatedAt: store.updatedAt,
    });
  }

  if (p.startsWith('/api/index/skill/') && req.method === 'POST') {
    const skillId = decodeURIComponent(p.replace('/api/index/skill/', ''));
    const skill = deps.scanSkills()[skillId];
    if (!skill) return json(res, { ok: false, error: 'Unknown skill: ' + skillId }, 404);
    const chunks = chunkSkill(skill);
    const embedded = await embedTexts(chunks.map((chunk) => chunk.text));
    if (!embedded.ok) {
      return json(
        res,
        { ok: false, error: embedded.error, chunks: chunks.length, model: embedded.model },
        503,
      );
    }
    const records = chunks.map((chunk, index) => ({ ...chunk, vector: embedded.vectors[index] || [] }));
    const store = upsertVectors(loadVectorStore(), records, embedded.model || DEFAULT_EMBED_MODEL);
    saveVectorStore(store);
    return json(res, {
      ok: true,
      skillId,
      chunks: records.length,
      model: store.model,
      updatedAt: store.updatedAt,
    });
  }

  if (p === '/api/search' && req.method === 'POST') {
    const data = await body(req);
    const query = String(data?.query || '').trim();
    const limit = Number(data?.limit || 10);
    if (!query) return json(res, { ok: false, error: 'query is required' }, 400);
    const store = loadVectorStore();
    if (!store.records.length)
      return json(res, { ok: false, error: 'Index is empty. Run /api/index first.' }, 400);
    const embedded = await embedTexts([query], { model: store.model || DEFAULT_EMBED_MODEL });
    if (!embedded.ok) return json(res, { ok: false, error: embedded.error, model: embedded.model }, 503);
    return json(res, {
      ok: true,
      query,
      results: searchVectors(store, embedded.vectors[0] || [], { limit }),
      model: embedded.model,
    });
  }

  if (p === '/api/dedup' && req.method === 'GET') {
    const store = loadVectorStore();
    if (!store.records.length)
      return json(res, { ok: false, error: 'Index is empty. Run /api/index first.' }, 400);
    const previous = loadDedupReport();
    const fresh = url.searchParams.get('refresh') === '1' || previous?.vectorUpdatedAt !== store.updatedAt;
    const report = fresh ? generateDedupReport(store, {}, previous) : previous;
    if (!report) return json(res, { ok: false, error: 'Dedup report unavailable' }, 500);
    if (fresh) saveDedupReport(report);
    return json(res, { ok: true, report });
  }

  if (p === '/api/dedup/resolve' && req.method === 'POST') {
    const data = await body(req);
    const report = loadDedupReport();
    if (!report) return json(res, { ok: false, error: 'No dedup report exists yet' }, 404);
    const clusterId = String(data?.clusterId || '').trim();
    const action = String(data?.action || '').trim();
    if (!clusterId || !action)
      return json(res, { ok: false, error: 'clusterId and action are required' }, 400);
    const updated = resolveDedupCluster(report, {
      clusterId,
      action,
      keepSkillId: typeof data?.keepSkillId === 'string' ? data.keepSkillId : undefined,
      note: typeof data?.note === 'string' ? data.note : undefined,
    });
    saveDedupReport(updated);
    return json(res, { ok: true, report: updated });
  }

  if (p === '/api/compile/smart' && req.method === 'POST') {
    const data = await body(req);
    let projectPath;
    try {
      projectPath =
        resolveRegisteredWorkspace(typeof data?.projectPath === 'string' ? data.projectPath : undefined) ||
        undefined;
    } catch (e) {
      return json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
    }
    const result = await smartCompile(
      {
        task: String(data?.task || ''),
        targets: Array.isArray(data?.targets) ? data.targets.map(String) : undefined,
        maxTokens: Number(data?.maxTokens || 0) || undefined,
        projectPath,
      },
      deps,
    );
    return json(res, result, result.ok ? 200 : result.status || 500);
  }

  return null;
}

function intelligenceRouteDocs() {
  return [
    { method: 'POST', path: '/api/index', description: 'Index all skill chunks into the vector store' },
    { method: 'POST', path: '/api/index/skill/:id', description: 'Index one skill into the vector store' },
    { method: 'POST', path: '/api/search', description: 'Search indexed skill chunks' },
    {
      method: 'POST',
      path: '/api/compile/smart',
      description: 'Compile task-selected skills with a token budget',
    },
    { method: 'GET', path: '/api/index/status', description: 'Get vector index status' },
    { method: 'GET', path: '/api/dedup', description: 'Generate or read vector duplicate clusters' },
    {
      method: 'POST',
      path: '/api/dedup/resolve',
      description: 'Mark a dedup cluster resolved, ignored, or open',
    },
  ];
}

module.exports = { handleIntelligenceRequest, intelligenceRouteDocs, resolveRegisteredWorkspace };
