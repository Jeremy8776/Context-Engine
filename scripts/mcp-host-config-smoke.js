// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildHostConfigs, installHostConfig } = require('../server/lib/mcp-host-config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-mcp-hosts-'));
const appDir = path.resolve(__dirname, '..');
const homedir = path.join(tmp, 'home');
const appData = path.join(tmp, 'appdata');
fs.mkdirSync(homedir, { recursive: true });
fs.mkdirSync(appData, { recursive: true });

function env() {
  return { homedir, appData, appDir, ceHost: '127.0.0.1', cePort: 3847 };
}

const hosts = buildHostConfigs(env());
assert.strictEqual(hosts.length >= 3, true, 'expected local hosts plus ChatGPT note');
assert.strictEqual(hosts.find((h) => h.id === 'claude-desktop')?.status, 'missing');
assert.strictEqual(hosts.find((h) => h.id === 'codex-cli')?.status, 'missing');
assert.strictEqual(hosts.find((h) => h.id === 'chatgpt-app')?.supported, false);

const claudePath = hosts.find((h) => h.id === 'claude-desktop')?.path;
assert.ok(claudePath, 'claude path missing');
fs.mkdirSync(path.dirname(claudePath), { recursive: true });
fs.writeFileSync(
  claudePath,
  JSON.stringify(
    {
      mcpServers: {
        existing: { command: 'node', args: ['other-server.js'] },
      },
    },
    null,
    2,
  ),
);

const claudeResult = installHostConfig('claude-desktop', env());
assert.strictEqual(claudeResult.ok, true);
const claudeConfig = JSON.parse(fs.readFileSync(claudePath, 'utf8'));
assert.deepStrictEqual(claudeConfig.mcpServers.existing, { command: 'node', args: ['other-server.js'] });
assert.strictEqual(claudeConfig.mcpServers['context-engine'].command, 'node');
assert.ok(claudeConfig.mcpServers['context-engine'].args[0].endsWith('mcp-server.mjs'));

const codexPath = hosts.find((h) => h.id === 'codex-cli')?.path;
assert.ok(codexPath, 'codex path missing');
fs.mkdirSync(path.dirname(codexPath), { recursive: true });
fs.writeFileSync(codexPath, 'model = "gpt-5-codex"\n');

const codexResult = installHostConfig('codex-cli', env());
assert.strictEqual(codexResult.ok, true);
const codexText = fs.readFileSync(codexPath, 'utf8');
assert.match(codexText, /# Context Engine MCP start/);
assert.match(codexText, /\[mcp_servers\.context-engine\]/);
assert.match(codexText, /CE_PORT = "3847"/);
assert.match(codexText, /# Context Engine MCP end/);

fs.writeFileSync(codexPath, '[mcp_servers.context-engine]\ncommand = "custom"\n');
const conflict = installHostConfig('codex-cli', env());
assert.strictEqual(conflict.ok, false);
assert.match(conflict.error || '', /unmarked/i);

console.log('mcp host config smoke ok');
