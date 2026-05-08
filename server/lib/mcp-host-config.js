// @ts-check

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PORT, HOMEDIR } = require('./config');

const SERVER_ID = 'context-engine';
const MARKER_START = '# Context Engine MCP start';
const MARKER_END = '# Context Engine MCP end';

/**
 * @typedef {Object} HostEnv
 * @property {string=} homedir
 * @property {string=} appData
 * @property {string=} appDir
 * @property {NodeJS.Platform=} platform
 * @property {string=} ceHost
 * @property {number=} cePort
 *
 * @typedef {Object} HostConfig
 * @property {string} id
 * @property {string} label
 * @property {boolean} supported
 * @property {string} status
 * @property {string | null} path
 * @property {string} summary
 * @property {string} snippet
 * @property {string | null} note
 *
 * @typedef {Object} InstallResult
 * @property {boolean} ok
 * @property {string=} id
 * @property {string=} path
 * @property {string=} status
 * @property {string=} error
 */

/** @param {HostEnv} env */
function normalizeEnv(env = {}) {
  const appDir = env.appDir || path.resolve(__dirname, '..', '..');
  const homedir = env.homedir || HOMEDIR || os.homedir();
  const platform = env.platform || process.platform;
  let appData = env.appData;
  if (!appData) {
    if (platform === 'win32') appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    else if (platform === 'darwin') appData = path.join(homedir, 'Library', 'Application Support');
    else appData = process.env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  }
  return {
    homedir,
    appData,
    appDir,
    platform,
    ceHost: env.ceHost || '127.0.0.1',
    cePort: env.cePort || PORT,
  };
}

/** @param {HostEnv} env */
function buildServerCommand(env = {}) {
  const e = normalizeEnv(env);
  return {
    command: 'node',
    args: [path.join(e.appDir, 'mcp-server.mjs')],
    env: {
      CE_HOST: e.ceHost,
      CE_PORT: String(e.cePort),
    },
  };
}

/** @param {HostEnv} env */
function claudePath(env = {}) {
  const e = normalizeEnv(env);
  // Claude Desktop stores its config under the OS-native user config dir:
  //   win32  → %APPDATA%\Claude\claude_desktop_config.json
  //   darwin → ~/Library/Application Support/Claude/claude_desktop_config.json
  //   linux  → $XDG_CONFIG_HOME/Claude/claude_desktop_config.json
  return path.join(e.appData, 'Claude', 'claude_desktop_config.json');
}

/** @param {HostEnv} env */
function codexPath(env = {}) {
  const e = normalizeEnv(env);
  return path.join(e.homedir, '.codex', 'config.toml');
}

/** @param {HostEnv} env */
function claudeSnippet(env = {}) {
  return JSON.stringify({ mcpServers: { [SERVER_ID]: buildServerCommand(env) } }, null, 2);
}

/** @param {HostEnv} env */
function codexSnippet(env = {}) {
  const server = buildServerCommand(env);
  const mcpPath = String(server.args[0] || '').replace(/\\/g, '\\\\');
  return [
    MARKER_START,
    `[mcp_servers.${SERVER_ID}]`,
    `command = "${server.command}"`,
    `args = ["${mcpPath}"]`,
    '',
    `[mcp_servers.${SERVER_ID}.env]`,
    `CE_HOST = "${server.env.CE_HOST}"`,
    `CE_PORT = "${server.env.CE_PORT}"`,
    MARKER_END,
    '',
  ].join('\n');
}

/**
 * @param {string} filePath
 * @param {'claude' | 'codex'} kind
 */
function statusFor(filePath, kind) {
  if (!fs.existsSync(filePath)) return 'missing';
  const text = fs.readFileSync(filePath, 'utf8');
  if (kind === 'claude') {
    try {
      const parsed = JSON.parse(text);
      return parsed?.mcpServers?.[SERVER_ID] ? 'connected' : 'configurable';
    } catch {
      return 'invalid';
    }
  }
  if (text.includes(MARKER_START) && text.includes(MARKER_END)) return 'connected';
  if (text.includes(`[mcp_servers.${SERVER_ID}]`)) return 'conflict';
  return 'configurable';
}

/**
 * @param {HostEnv} env
 * @returns {boolean}
 */
function claudeDesktopAppDetected(env = {}) {
  const e = normalizeEnv(env);
  // Presence of the host's data dir is a stronger signal than the config
  // file alone, which only exists once the user has saved a setting.
  return fs.existsSync(path.dirname(claudePath(e)));
}

/**
 * @param {HostEnv} env
 * @returns {boolean}
 */
function codexCliDetected(env = {}) {
  const e = normalizeEnv(env);
  return fs.existsSync(path.dirname(codexPath(e)));
}

/**
 * @typedef {{ id: string, title: string, body: string, done: boolean,
 *   action?: { type: 'install' | 'copy-snippet' | 'open-link' | 'docs', href?: string, hostId?: string } }} HostStep
 */

/**
 * @param {HostEnv} env
 * @param {string} status
 * @param {boolean} appDetected
 * @returns {HostStep[]}
 */
function claudeSteps(env, status, appDetected) {
  const connected = status === 'connected';
  /** @type {HostStep[]} */
  const steps = [
    {
      id: 'install-app',
      title: 'Install Claude Desktop',
      body: appDetected
        ? 'Claude Desktop is installed on this machine.'
        : 'Download and sign in once so the app creates its config directory.',
      done: appDetected,
      action: appDetected ? undefined : { type: 'open-link', href: 'https://claude.ai/download' },
    },
    {
      id: 'connect-mcp',
      title: 'Connect Context Engine MCP',
      body: connected
        ? 'Claude Desktop is configured to spawn the Context Engine MCP bridge on launch.'
        : 'Add the Context Engine entry to claude_desktop_config.json. CE only writes its own server entry; existing MCPs are preserved.',
      done: connected,
      action: connected ? undefined : { type: 'install', hostId: 'claude-desktop' },
    },
    {
      id: 'restart-host',
      title: 'Restart Claude Desktop',
      body: 'Claude reads the config on launch, so quit fully (tray icon) and reopen after connecting.',
      done: false,
    },
  ];
  return steps;
}

/**
 * @param {HostEnv} env
 * @param {string} status
 * @param {boolean} appDetected
 * @returns {HostStep[]}
 */
function codexSteps(env, status, appDetected) {
  const connected = status === 'connected';
  const conflict = status === 'conflict';
  /** @type {HostStep[]} */
  const steps = [
    {
      id: 'install-cli',
      title: 'Install Codex CLI',
      body: appDetected
        ? 'Codex CLI config directory found.'
        : 'Run the Codex CLI once so it creates ~/.codex/.',
      done: appDetected,
      action: appDetected ? undefined : { type: 'open-link', href: 'https://github.com/openai/codex' },
    },
    {
      id: 'connect-mcp',
      title: 'Connect Context Engine MCP',
      body: connected
        ? 'Context Engine is wired into ~/.codex/config.toml inside marker comments.'
        : conflict
          ? 'An unmarked context-engine entry already exists in your config.toml. Review and remove it before CE can manage this section.'
          : 'CE will append a marker-wrapped [mcp_servers.context-engine] block, leaving everything else in your config alone.',
      done: connected,
      action: connected || conflict ? undefined : { type: 'install', hostId: 'codex-cli' },
    },
  ];
  return steps;
}

/** @returns {HostStep[]} */
function chatgptSteps() {
  return [
    {
      id: 'expose-https',
      title: 'Expose CE over HTTPS',
      body: 'ChatGPT can only reach remote MCP servers over HTTPS. Run `npm run mcp:http` behind a trusted tunnel (Cloudflare Tunnel, ngrok) or a hosted endpoint.',
      done: false,
      action: { type: 'docs', href: 'docs/mcp-bridge.md' },
    },
    {
      id: 'set-auth',
      title: 'Set MCP_OAUTH_PASSWORD',
      body: 'Required to keep the public endpoint protected. Without it, CE refuses to bind to non-loopback interfaces.',
      done: false,
    },
    {
      id: 'register-connector',
      title: 'Register the connector in ChatGPT',
      body: 'Open ChatGPT developer mode and add a custom MCP connector pointing at https://your-domain/mcp.',
      done: false,
      action: { type: 'open-link', href: 'https://platform.openai.com/docs/guides/connectors' },
    },
  ];
}

/** @param {HostEnv} env */
function buildHostConfigs(env = {}) {
  const cp = claudePath(env);
  const xp = codexPath(env);
  const claudeStatus = statusFor(cp, 'claude');
  const codexStatus = statusFor(xp, 'codex');
  const claudeApp = claudeDesktopAppDetected(env);
  const codexApp = codexCliDetected(env);
  return [
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      supported: true,
      mode: 'local-stdio',
      status: claudeStatus,
      appDetected: claudeApp,
      path: cp,
      summary: 'Local MCP stdio. Claude spawns the Context Engine bridge when the app starts.',
      snippet: claudeSnippet(env),
      note: null,
      steps: claudeSteps(env, claudeStatus, claudeApp),
    },
    {
      id: 'codex-cli',
      label: 'Codex CLI',
      supported: true,
      mode: 'local-stdio',
      status: codexStatus,
      appDetected: codexApp,
      path: xp,
      summary: 'Local MCP stdio via ~/.codex/config.toml.',
      snippet: codexSnippet(env),
      note: null,
      steps: codexSteps(env, codexStatus, codexApp),
    },
    {
      id: 'chatgpt-app',
      label: 'ChatGPT app / web',
      supported: false,
      mode: 'remote-http',
      status: 'remote-required',
      appDetected: false,
      path: null,
      summary: 'Connects via Streamable HTTP behind HTTPS; local stdio cannot be installed here.',
      snippet: '',
      note: 'Run npm run mcp:http behind a trusted tunnel or hosted endpoint, then register that HTTPS /mcp URL in ChatGPT developer mode.',
      steps: chatgptSteps(),
    },
  ];
}

/** @param {string} filePath */
function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * @param {string} hostId
 * @param {HostEnv} env
 * @returns {InstallResult}
 */
function installHostConfig(hostId, env = {}) {
  if (hostId === 'claude-desktop') return installClaude(env);
  if (hostId === 'codex-cli') return installCodex(env);
  return { ok: false, id: hostId, error: 'Host cannot be installed automatically.' };
}

/** @param {HostEnv} env */
function installClaude(env = {}) {
  const filePath = claudePath(env);
  ensureParent(filePath);
  /** @type {{ mcpServers?: Record<string, unknown>, [key: string]: unknown }} */
  let data = {};
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return { ok: false, id: 'claude-desktop', path: filePath, error: 'Claude config is not valid JSON.' };
    }
  }
  const next = { ...data, mcpServers: { ...(data.mcpServers || {}), [SERVER_ID]: buildServerCommand(env) } };
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { ok: true, id: 'claude-desktop', path: filePath, status: statusFor(filePath, 'claude') };
}

/** @param {HostEnv} env */
function installCodex(env = {}) {
  const filePath = codexPath(env);
  ensureParent(filePath);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (
    existing.includes(`[mcp_servers.${SERVER_ID}]`) &&
    !(existing.includes(MARKER_START) && existing.includes(MARKER_END))
  ) {
    return {
      ok: false,
      id: 'codex-cli',
      path: filePath,
      error: 'Found unmarked context-engine MCP config. Review it manually before CE updates this file.',
    };
  }
  const block = codexSnippet(env);
  const next =
    existing.includes(MARKER_START) && existing.includes(MARKER_END)
      ? existing.replace(
          new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`, 'm'),
          block,
        )
      : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}`;
  fs.writeFileSync(filePath, next, 'utf8');
  return { ok: true, id: 'codex-cli', path: filePath, status: statusFor(filePath, 'codex') };
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  buildHostConfigs,
  installHostConfig,
};
