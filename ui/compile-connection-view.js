// @ts-check

const CompileConnectionView = (() => {
  /** @type {Record<string, { logo: string }>} */
  const HOST_META = {
    'claude-desktop': {
      logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg',
    },
    'codex-cli': {
      logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg',
    },
    'chatgpt-app': {
      logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg',
    },
  };

  /** @param {McpHostRecord} host */
  function renderLogo(host) {
    const meta = HOST_META[host.id];
    if (!meta) return '';
    const iconClass = String(host.id || 'host')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
    return `<span class="compile-target-logo target-${iconClass}"><img src="${esc(meta.logo)}" alt="" loading="lazy"></span>`;
  }

  /** @param {McpHostRecord} host */
  function renderRows(host) {
    const c = host.connection;
    if (!c) return '';
    return [
      row('Transport', c.transport),
      row('MCP URL', c.mcpUrl),
      row('CE endpoint', c.endpoint),
      row('Auth', c.auth),
      row('Command', c.command),
    ].join('');
  }

  /** @param {string} label @param {string | undefined} value */
  function row(label, value) {
    return value ? `<div class="mcp-config-row"><span>${label}</span><code>${esc(value)}</code></div>` : '';
  }

  /** @param {IndexStatusView} indexStatus @param {{ hosts: McpHostRecord[] }} ctx */
  function renderPageStatus(indexStatus, ctx) {
    const hosts = ctx.hosts || [];
    const local = hosts.filter((host) => host.supported);
    const connected = local.filter((host) => host.status === 'connected').length;
    return `<div class="connection-hero">
      <span class="compile-kicker">Context Engine</span>
      <div class="connection-hero-main">
        <strong>Runtime online</strong>
        <span class="ct-badge ct-installed">Reachable</span>
      </div>
      <p>${connected}/${local.length || 0} local MCP hosts connected</p>
    </div>`;
  }

  return { renderLogo, renderPageStatus, renderRows };
})();
