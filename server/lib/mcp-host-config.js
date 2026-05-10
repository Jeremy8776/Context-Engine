// @ts-check

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PORT, HOMEDIR } = require('./config');

const SERVER_ID = 'context-engine';
const CLAUDE_EXTENSION_ID = 'ant.dir.datacert.context-engine';
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
 * @property {{ transport: string, endpoint?: string, mcpUrl?: string, auth?: string, command?: string }=} connection
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
function claudeExtensionPath(env = {}) {
  const e = normalizeEnv(env);
  return path.join(e.appData, 'Claude', 'Claude Extensions', CLAUDE_EXTENSION_ID);
}

/** @param {HostEnv} env */
function codexPath(env = {}) {
  const e = normalizeEnv(env);
  return path.join(e.homedir, '.codex', 'config.toml');
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

/** @param {HostEnv} env */
function claudeExtensionStatus(env = {}) {
  const extensionPath = claudeExtensionPath(env);
  if (!fs.existsSync(extensionPath)) return 'configurable';
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) return 'invalid';
  if (!fs.existsSync(path.join(extensionPath, 'server', 'index.mjs'))) return 'invalid';
  return 'connected';
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
  const extensionPath = claudeExtensionPath(env);
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
      title: 'Install Context Engine extension',
      body: connected
        ? 'The local Context Engine desktop extension is installed for Claude Desktop.'
        : `Install the local desktop extension into ${extensionPath}. This is the right path for localhost and private machine context.`,
      done: connected,
      action: connected ? undefined : { type: 'install', hostId: 'claude-desktop' },
    },
    {
      id: 'restart-host',
      title: 'Restart or re-enable Claude Desktop',
      body: 'If Claude says the extension server cannot connect, disable/re-enable the extension or fully restart Claude Desktop.',
      done: false,
    },
    {
      id: 'permissions',
      title: 'Allow read-only tools in Claude',
      body: 'In Claude tool permissions, set read-only Context Engine tools to Always allow or Needs approval. Blocked tools are connected but unusable in chat.',
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
  const e = normalizeEnv(env);
  const cp = claudeExtensionPath(env);
  const xp = codexPath(env);
  const claudeStatus = claudeExtensionStatus(env);
  const codexStatus = statusFor(xp, 'codex');
  const claudeApp = claudeDesktopAppDetected(env);
  const codexApp = codexCliDetected(env);
  return [
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      supported: true,
      mode: 'local-extension',
      status: claudeStatus,
      appDetected: claudeApp,
      path: cp,
      summary:
        'Local Claude Desktop extension that exposes Context Engine tools inside desktop chat. Best for private machine context: files, memory search, localhost services, and anything that should never leave this computer.',
      snippet: '',
      note: 'This applies to Claude Desktop on this computer. Claude web and mobile require a remote HTTPS connector instead.',
      connection: localConnection(e, 'Desktop extension', 'Claude starts the packaged MCPB server'),
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
      summary:
        'Local stdio MCP connection for Codex CLI. Lets Codex call CE tools during terminal agent sessions instead of relying only on generated instruction files.',
      snippet: codexSnippet(env),
      note: null,
      connection: localConnection(e, 'Local stdio', 'node mcp-server.mjs'),
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
      summary:
        'Remote MCP path for ChatGPT app and web. This needs an HTTPS-reachable connector with auth because ChatGPT cannot reach a private local stdio server directly.',
      snippet: '',
      note: 'Run npm run mcp:http behind a trusted tunnel or hosted endpoint, then register that HTTPS /mcp URL in ChatGPT developer mode.',
      connection: remoteHttpConnection(),
      steps: chatgptSteps(),
    },
  ];
}

/** @param {ReturnType<typeof normalizeEnv>} env @param {string} transport @param {string} command */
function localConnection(env, transport, command) {
  const endpoint = `http://${env.ceHost}:${env.cePort}`;
  return {
    transport,
    endpoint,
    mcpUrl: endpoint,
    auth: 'Local machine only',
    command,
  };
}

function remoteHttpConnection() {
  const host = process.env.MCP_HTTP_HOST || '127.0.0.1';
  const port = process.env.MCP_HTTP_PORT || '3850';
  const publicUrl = (process.env.MCP_PUBLIC_URL || `http://${host}:${port}`).replace(/\/+$/, '');
  const auth = process.env.MCP_OAUTH_PASSWORD
    ? 'OAuth + PKCE'
    : process.env.MCP_HTTP_TOKEN
      ? 'Bearer token'
      : 'Not configured';
  return {
    transport: 'Streamable HTTP',
    endpoint: `http://${host}:${port}/mcp`,
    mcpUrl: `${publicUrl}/mcp`,
    auth,
    command: 'npm run mcp:http',
  };
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
  if (hostId === 'claude-desktop') return installClaudeExtension(env);
  if (hostId === 'codex-cli') return installCodex(env);
  return { ok: false, id: hostId, error: 'Host cannot be installed automatically.' };
}

/** @param {HostEnv} env */
function installClaudeExtension(env = {}) {
  const e = normalizeEnv(env);
  const source = path.join(e.appDir, 'mcpb', 'context-engine');
  const schemasSource = path.join(e.appDir, 'mcp-schemas.json');
  const filePath = claudeExtensionPath(e);
  if (!fs.existsSync(source)) {
    return {
      ok: false,
      id: 'claude-desktop',
      path: filePath,
      error: `Claude extension source was not found: ${source}`,
    };
  }
  fs.rmSync(filePath, { recursive: true, force: true });
  ensureParent(filePath);
  fs.cpSync(source, filePath, { recursive: true });
  // The wrapper looks for server/schemas.json first; without it, it falls back
  // to a path that exists only in the repo, which crashes the installed copy.
  // Pack-mcpb.ps1 does this for distributable .mcpb bundles; mirror it here.
  if (fs.existsSync(schemasSource)) {
    fs.cpSync(schemasSource, path.join(filePath, 'server', 'schemas.json'));
  }
  // If a duplicate context-engine entry was previously written into
  // claude_desktop_config.json (legacy admin-panel path), strip it so the
  // host doesn't show two Context Engine servers.
  const legacyPath = claudePath(e);
  if (fs.existsSync(legacyPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (parsed?.mcpServers && parsed.mcpServers[SERVER_ID]) {
        delete parsed.mcpServers[SERVER_ID];
        if (Object.keys(parsed.mcpServers).length === 0) delete parsed.mcpServers;
        fs.writeFileSync(legacyPath, JSON.stringify(parsed, null, 2));
      }
    } catch {
      // tolerate unreadable legacy config — extension install still proceeds
    }
  }
  return { ok: true, id: 'claude-desktop', path: filePath, status: claudeExtensionStatus(e) };
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
