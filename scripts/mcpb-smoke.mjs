import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CE_PORT = process.env.CE_SMOKE_PORT || '3864';
const EXTENSION_SERVER =
  process.env.CE_SMOKE_EXTENSION_PATH || path.join(APP_DIR, 'mcpb/context-engine/server/index.mjs');

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

const failures = [];
function pass(message) {
  console.log(`ok  ${message}`);
}
function fail(message, error) {
  console.error(`fail ${message}${error ? ` - ${error.message || error}` : ''}`);
  failures.push(message);
}

let client;
try {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [EXTENSION_SERVER],
    env: { ...process.env, CE_HOST: '127.0.0.1', CE_PORT },
  });
  client = new Client({ name: 'context-engine-mcpb-smoke', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  pass('connect: desktop extension wrapper');

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  if (names.includes('context_engine_status')) pass(`tools/list: ${tools.length} tools`);
  else fail('tools/list: missing context_engine_status');

  const status = await client.callTool({ name: 'context_engine_status', arguments: {} });
  if (status.isError) fail('call: context_engine_status returned isError');
  else pass('call: context_engine_status');

  const expected = await expectedActiveSkillCount();
  const activeSkills = await client.callTool({
    name: 'context_engine_list_skills',
    arguments: { activeOnly: true },
  });
  if (activeSkills.isError) fail('call: context_engine_list_skills activeOnly returned isError');
  else {
    const payload = JSON.parse(activeSkills.content?.[0]?.text || '{}');
    if (payload.count !== expected) fail(`call: activeOnly expected ${expected}, got ${payload.count}`);
    else pass(`call: context_engine_list_skills activeOnly (${expected})`);
  }
} catch (error) {
  fail('fatal', error);
} finally {
  try {
    await client?.close();
  } catch {
    /* no-op */
  }
  httpServer.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nall checks passed');
}
