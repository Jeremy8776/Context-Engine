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
assert.strictEqual(hosts.find((h) => h.id === 'claude-desktop')?.status, 'configurable');
assert.strictEqual(hosts.find((h) => h.id === 'codex-cli')?.status, 'missing');
assert.strictEqual(hosts.find((h) => h.id === 'chatgpt-app')?.supported, false);

const claudeExtensionPath = hosts.find((h) => h.id === 'claude-desktop')?.path;
assert.ok(claudeExtensionPath, 'claude extension path missing');

// Seed a legacy duplicate to confirm install strips it.
const legacyConfigPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
fs.mkdirSync(path.dirname(legacyConfigPath), { recursive: true });
fs.writeFileSync(
  legacyConfigPath,
  JSON.stringify(
    {
      mcpServers: {
        'context-engine': { command: 'node', args: ['legacy.mjs'] },
        keep: { command: 'keep' },
      },
      preferences: { other: true },
    },
    null,
    2,
  ),
);

const claudeResult = installHostConfig('claude-desktop', env());
assert.strictEqual(claudeResult.ok, true);
assert.strictEqual(claudeResult.status, 'connected');
assert.ok(fs.existsSync(path.join(claudeExtensionPath, 'manifest.json')));
assert.ok(fs.existsSync(path.join(claudeExtensionPath, 'server', 'index.mjs')));
assert.ok(
  fs.existsSync(path.join(claudeExtensionPath, 'server', 'schemas.json')),
  'schemas.json must be copied so the wrapper does not crash on startup',
);

const legacyAfter = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'));
assert.strictEqual(
  legacyAfter?.mcpServers?.['context-engine'],
  undefined,
  'legacy mcpServers.context-engine entry must be stripped to avoid duplicate Context Engine in Claude Desktop',
);
assert.ok(legacyAfter?.mcpServers?.keep, 'unrelated mcpServers entries must be preserved');
assert.ok(legacyAfter?.preferences?.other, 'unrelated preferences must be preserved');

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
