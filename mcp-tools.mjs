// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CE_HOST = process.env.CE_HOST || '127.0.0.1';
const CE_PORT = parseInt(process.env.CE_PORT || '3847', 10);
const CE_BASE = `http://${CE_HOST}:${CE_PORT}`;

const SCHEMAS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-schemas.json');
const SCHEMAS = JSON.parse(readFileSync(SCHEMAS_PATH, 'utf8'));
const SERVER_INFO = { name: SCHEMAS.name, version: SCHEMAS.version };

class CEUnreachableError extends Error {
  constructor(detail) {
    super(
      `Context Engine is not running at ${CE_BASE}. Start the desktop app or run "npm start" in the app directory. (${detail})`,
    );
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
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new CEUnreachableError(e.message);
  }
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`CE returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = parsed && parsed.error ? parsed.error : `CE responded ${res.status}`;
    throw new CEHttpError(msg, res.status, parsed);
  }
  return parsed;
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
    list = list.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.cat,
      description: s.desc,
      triggers: s.triggers || [],
      active: states[s.id] === true,
    }));
    if (category) list = list.filter((s) => s.category === category);
    if (activeOnly) list = list.filter((s) => s.active);
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
    if (repo) list = list.filter((h) => h.repo === repo);
    if (thread_tag) list = list.filter((h) => h.thread_tag === thread_tag);
    // Keep the resume payload bounded; commit_timeline is capped server-side.
    return {
      count: list.length,
      handoffs: list.map((h) => ({
        slug: h.slug,
        title: h.title,
        type: h.type,
        repo: h.repo,
        thread_tag: h.thread_tag,
        last_touched: h.last_touched,
        commits_past_head: h.staleness?.commits_past_head ?? null,
        commit_timeline: Array.isArray(h.staleness?.commit_timeline) ? h.staleness.commit_timeline : [],
        body: h.body,
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
const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function createContextEngineMcpServer() {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS_BY_NAME[name];
    if (!tool) {
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
    try {
      const result = await tool.handler(args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const code = e.code || 'TOOL_ERROR';
      const detail = e.payload ? `\n\nServer payload: ${JSON.stringify(e.payload)}` : '';
      return { isError: true, content: [{ type: 'text', text: `[${code}] ${e.message}${detail}` }] };
    }
  });
  return server;
}

export { CE_BASE, SERVER_INFO, TOOLS, createContextEngineMcpServer };
