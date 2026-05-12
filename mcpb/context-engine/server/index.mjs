// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

import readline from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CE_HOST = process.env.CE_HOST || '127.0.0.1';
const CE_PORT = Number.parseInt(process.env.CE_PORT || '3847', 10);
const CE_BASE = `http://${CE_HOST}:${Number.isFinite(CE_PORT) ? CE_PORT : 3847}`;

// Schemas are pulled from the canonical mcp-schemas.json. After packing into
// an .mcpb bundle, pack-mcpb.ps1 copies that file in alongside index.mjs.
// When running from the in-repo source tree (smoke tests, dev), we fall back
// to the canonical location at the app root.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_SCHEMAS = path.join(HERE, 'schemas.json');
const REPO_SCHEMAS = path.resolve(HERE, '..', '..', '..', 'mcp-schemas.json');
const SCHEMAS_PATH = existsSync(LOCAL_SCHEMAS) ? LOCAL_SCHEMAS : REPO_SCHEMAS;
const SCHEMAS = JSON.parse(readFileSync(SCHEMAS_PATH, 'utf8'));

class CEUnreachableError extends Error {
  constructor(detail) {
    super(`Context Engine is not running at ${CE_BASE}. Start Context Engine, then retry. (${detail})`);
    this.code = 'CE_UNREACHABLE';
  }
}

class CEHttpError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.code = 'CE_HTTP_ERROR';
    this.status = status;
    this.payload = payload;
  }
}

const HANDLERS = {
  context_engine_search: async ({ query, limit }) => {
    if (!query || typeof query !== 'string') throw new Error('query is required and must be a string');
    const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const result = await ceRequest('POST', '/api/search', { body: { query, limit: cappedLimit } });
    return { query: result.query, model: result.model, results: sanitizeSearchResults(result.results) };
  },
  context_engine_list_skills: async ({ activeOnly, category } = {}) => {
    const [skills, statesResp] = await Promise.all([
      ceRequest('GET', '/api/skills'),
      ceRequest('GET', '/api/states').catch(() => ({})),
    ]);
    const states = normalizeStatesResponse(statesResp);
    let list = Array.isArray(skills) ? skills : [];
    list = list.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.cat,
      description: skill.desc,
      triggers: skill.triggers || [],
      active: states[skill.id] === true,
    }));
    if (category) list = list.filter((skill) => skill.category === category);
    if (activeOnly) list = list.filter((skill) => skill.active);
    return { count: list.length, skills: list };
  },
  context_engine_get_skill: async ({ id, section }) => {
    if (!id || typeof id !== 'string') throw new Error('id is required and must be a string');
    const resp = await ceRequest('GET', `/api/skills/${encodeURIComponent(id)}`, {
      query: section ? { section } : undefined,
    });
    if (section) return { id, section: resp.section, body: resp.body, name: resp.skill?.name };
    return {
      id,
      name: resp.skill?.name,
      category: resp.skill?.cat,
      description: resp.skill?.desc,
      sections: resp.sections || [],
      body: resp.body,
    };
  },
  context_engine_status: async () => {
    const status = await ceRequest('GET', '/api/index/status');
    return {
      chunks: status.chunks || 0,
      skills: status.skills || 0,
      model: status.model || null,
      updatedAt: status.updatedAt || null,
      ready: (status.chunks || 0) > 0,
    };
  },
  context_engine_handoffs: async ({ repo, thread_tag } = {}) => {
    const resp = await ceRequest('GET', '/api/handoffs');
    let list = Array.isArray(resp?.handoffs) ? resp.handoffs : [];
    if (repo) list = list.filter((handoff) => handoff.repo === repo);
    if (thread_tag) list = list.filter((handoff) => handoff.thread_tag === thread_tag);
    return {
      count: list.length,
      handoffs: list.map((handoff) => ({
        slug: handoff.slug,
        title: handoff.title,
        type: handoff.type,
        repo: handoff.repo,
        thread_tag: handoff.thread_tag,
        last_touched: handoff.last_touched,
        commits_past_head: handoff.staleness?.commits_past_head ?? null,
        commit_timeline: Array.isArray(handoff.staleness?.commit_timeline)
          ? handoff.staleness.commit_timeline
          : [],
        body: handoff.body,
      })),
    };
  },
  context_engine_sync_project_handoff: async ({ repo }) => {
    if (!repo || typeof repo !== 'string') throw new Error('repo is required and must be a string');
    const result = await ceRequest('POST', '/api/handoffs/sync-project', { body: { repo } });
    return {
      ok: result.ok === true,
      created: result.created === true,
      source: result.source,
      handoff: result.handoff
        ? {
            slug: result.handoff.slug,
            title: result.handoff.title,
            type: result.handoff.type,
            repo: result.handoff.repo,
            thread_tag: result.handoff.thread_tag,
            last_touched: result.handoff.last_touched,
          }
        : null,
    };
  },
};

const TOOLS = SCHEMAS.tools.map((schema) => ({ ...schema, handler: HANDLERS[schema.name] }));
const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function sanitizeSearchResults(results) {
  return (Array.isArray(results) ? results : []).map((result) => ({
    id: result.id,
    skillId: result.skillId,
    section: result.section,
    text: result.text,
    type: result.type,
    sourcePath: result.sourcePath,
    score: result.score,
  }));
}

function normalizeStatesResponse(response) {
  if (!response || typeof response !== 'object') return {};
  return response.states && typeof response.states === 'object' ? response.states : response;
}

async function ceRequest(method, pathname, { body, query } = {}) {
  const url = new URL(pathname, CE_BASE);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new CEUnreachableError(error.message);
  }
  const text = await response.text();
  const parsed = text ? parseJson(text, `CE returned non-JSON (${response.status})`) : {};
  if (!response.ok) {
    throw new CEHttpError(parsed.error || `CE responded ${response.status}`, response.status, parsed);
  }
  return parsed;
}

function parseJson(text, prefix = 'Invalid JSON-RPC message') {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${prefix}: ${error.message}`);
  }
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  write({ jsonrpc: '2.0', id, result: value });
}

function failure(id, error) {
  write({
    jsonrpc: '2.0',
    id,
    error: { code: -32000, message: error.message || String(error) },
  });
}

async function handle(message) {
  if (!message || typeof message !== 'object') return;
  if (message.id === undefined) return;

  try {
    if (message.method === 'initialize') {
      result(message.id, {
        protocolVersion: message.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: SCHEMAS.name, title: 'Context Engine', version: SCHEMAS.version },
      });
      return;
    }

    if (message.method === 'ping') {
      result(message.id, {});
      return;
    }

    if (message.method === 'tools/list') {
      result(message.id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
      return;
    }

    if (message.method === 'tools/call') {
      const tool = TOOLS_BY_NAME.get(message.params?.name);
      if (!tool) {
        result(message.id, {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${message.params?.name}` }],
        });
        return;
      }
      try {
        const value = await tool.handler(message.params?.arguments || {});
        result(message.id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
      } catch (error) {
        const code = error.code || 'TOOL_ERROR';
        const detail = error.payload ? `\n\nServer payload: ${JSON.stringify(error.payload)}` : '';
        result(message.id, {
          isError: true,
          content: [{ type: 'text', text: `[${code}] ${error.message}${detail}` }],
        });
      }
      return;
    }

    failure(message.id, new Error(`Unsupported method: ${message.method}`));
  } catch (error) {
    failure(message.id, error);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line.trim()) void handle(parseJson(line));
});

process.stderr.write(`context-engine desktop extension connected (CE_BASE=${CE_BASE})\n`);
