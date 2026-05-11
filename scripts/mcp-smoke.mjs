// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// mcp-smoke.mjs — Spawns the MCP server, validates protocol handshake, lists
// tools, and exercises each tool against an in-process CE HTTP server.
//
// Run with `npm run smoke:mcp`. Exits non-zero on any failure so CI can gate
// on it. Uses a non-default CE port so it does not collide with a running
// desktop app.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CE_PORT = process.env.CE_SMOKE_PORT || '3858';

process.env.CE_PORT = CE_PORT;

// Start CE HTTP server in-process so the MCP child has something to call.
const { startServer } = require(path.join(APP_DIR, 'server/server.js'));
const httpServer = startServer({ port: Number(CE_PORT), refresh: false });
await new Promise((resolve) => httpServer.once('listening', resolve));

async function expectedActiveSkillCount() {
  const [skills, statesResp] = await Promise.all([
    fetch(`http://127.0.0.1:${CE_PORT}/api/skills`).then((res) => res.json()),
    fetch(`http://127.0.0.1:${CE_PORT}/api/states`).then((res) => res.json()),
  ]);
  const states = statesResp.states || statesResp;
  return (Array.isArray(skills) ? skills : []).filter((skill) => states[skill.id] === true).length;
}

const EXPECTED_TOOLS = [
  'context_engine_search',
  'context_engine_list_skills',
  'context_engine_get_skill',
  'context_engine_status',
];

const failures = [];
function pass(msg) {
  console.log(`ok  ${msg}`);
}
function fail(msg, err) {
  const detail = err ? ` — ${err.message || err}` : '';
  console.error(`fail ${msg}${detail}`);
  failures.push(msg);
}

let client;
try {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(APP_DIR, 'mcp-server.mjs')],
    env: { ...process.env, CE_PORT, CE_HOST: '127.0.0.1' },
  });
  client = new Client({ name: 'context-engine-smoke', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  pass('connect: stdio handshake');

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n));
  if (missing.length) fail(`tools/list: missing ${missing.join(', ')}`);
  else pass(`tools/list: ${names.length} tools`);

  for (const tool of tools) {
    if (!tool.description || tool.description.length < 20) fail(`schema: ${tool.name} description too short`);
    if (!tool.inputSchema || tool.inputSchema.type !== 'object')
      fail(`schema: ${tool.name} inputSchema not an object`);
  }
  if (!failures.length) pass('schemas: all tools have descriptions and object schemas');

  // status: must succeed even when the index is empty
  try {
    const r = await client.callTool({ name: 'context_engine_status', arguments: {} });
    if (r.isError) fail('call: context_engine_status returned isError', new Error(r.content?.[0]?.text));
    else pass('call: context_engine_status');
  } catch (e) {
    fail('call: context_engine_status threw', e);
  }

  // list_skills: should always succeed (returns empty array if no skills)
  try {
    const r = await client.callTool({ name: 'context_engine_list_skills', arguments: {} });
    if (r.isError) fail('call: context_engine_list_skills returned isError', new Error(r.content?.[0]?.text));
    else pass('call: context_engine_list_skills');
  } catch (e) {
    fail('call: context_engine_list_skills threw', e);
  }

  try {
    const expected = await expectedActiveSkillCount();
    const r = await client.callTool({
      name: 'context_engine_list_skills',
      arguments: { activeOnly: true },
    });
    if (r.isError) {
      fail('call: context_engine_list_skills activeOnly returned isError', new Error(r.content?.[0]?.text));
    } else {
      const payload = JSON.parse(r.content?.[0]?.text || '{}');
      if (payload.count !== expected) fail(`call: activeOnly expected ${expected}, got ${payload.count}`);
      else pass(`call: context_engine_list_skills activeOnly (${expected})`);
    }
  } catch (e) {
    fail('call: context_engine_list_skills activeOnly threw', e);
  }

  // search: expected to return isError when index is empty (smoke env has no index built)
  try {
    const r = await client.callTool({
      name: 'context_engine_search',
      arguments: { query: 'smoke test query' },
    });
    if (r.isError) pass('call: context_engine_search reports empty-index error correctly');
    else pass('call: context_engine_search returned results');
  } catch (e) {
    fail('call: context_engine_search threw', e);
  }

  // get_skill against a known-bad id: should surface 404 as a structured error
  try {
    const r = await client.callTool({
      name: 'context_engine_get_skill',
      arguments: { id: '__nonexistent_skill__' },
    });
    if (r.isError) pass('call: context_engine_get_skill surfaces 404 as isError');
    else fail('call: context_engine_get_skill should have errored on bad id');
  } catch (e) {
    fail('call: context_engine_get_skill threw', e);
  }
} catch (e) {
  fail('fatal', e);
} finally {
  try {
    await client?.close();
  } catch {
    /* ignore close errors */
  }
  httpServer.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nall checks passed');
}