// @ts-check

const CompileView = (() => {
  /** @type {Record<string, { label: string, logo?: string }>} */
  const TARGET_META = {
    claude: { label: 'Claude Code', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg' },
    cursor: { label: 'Cursor', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cursor.svg' },
    agents: { label: 'AGENTS.md', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/markdown.svg' },
    codex: {
      label: 'Codex',
      logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg',
    },
    copilot: {
      label: 'GitHub Copilot',
      logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/githubcopilot.svg',
    },
    windsurf: { label: 'Windsurf', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/windsurf.svg' },
    antigravity: { label: 'Antigravity', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/google.svg' },
    kiro: { label: 'Kiro', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Aws_logo.svg' },
    cline: { label: 'Cline / Roo', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cline.svg' },
    aider: { label: 'Aider', logo: 'https://aider.chat/assets/logo.svg' },
    continue: {
      label: 'Continue.dev',
      logo: 'https://raw.githubusercontent.com/continuedev/continue/main/extensions/vscode/media/sidebar-icon.png',
    },
    zed: { label: 'Zed', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/zedindustries.svg' },
    junie: { label: 'Junie', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/jetbrains.svg' },
    trae: {
      label: 'Trae',
      logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/trae.svg',
    },
    amp: {
      label: 'Amp',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sourcegraph-logo-light.svg',
    },
    devin: { label: 'Devin', logo: 'https://static.cdnlogo.com/logos/d/97/devin.svg' },
    goose: {
      label: 'Goose',
      logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/goose.svg',
    },
    void: { label: 'Void', logo: 'https://static.cdnlogo.com/logos/v/51/void.svg' },
    augment: { label: 'Augment', logo: 'https://static.cdnlogo.com/logos/a/44/augment-code.svg' },
    pearai: { label: 'PearAI', logo: 'assets/logos/pearai.svg' },
    ollama: { label: 'Ollama', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/ollama.svg' },
    kimi: {
      label: 'Kimi K2',
      logo: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/kimi-ai.svg',
    },
  };

  const FILE_STANDARD_TARGETS = new Set(['agents', 'copilot']);

  /** @param {string} id */
  function targetClass(id) {
    return String(id || 'target')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
  }

  /** @param {string} id */
  function targetLabel(id) {
    return TARGET_META[id]?.label || id;
  }

  /** @param {string} id */
  function targetLogo(id) {
    const meta = TARGET_META[id] || { label: id };
    if (!meta.logo) return '';
    return `<span class="compile-target-logo target-${targetClass(id)}"><img src="${esc(meta.logo)}" alt="" loading="lazy"></span>`;
  }

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isToolDetected(id, tool) {
    return !!(
      tool?.detected ||
      tool?.globalInstalled ||
      isFileStandard(id, tool) ||
      tool?.category === 'manual'
    );
  }

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isFileStandard(id, tool) {
    return !!(tool?.fileStandard || FILE_STANDARD_TARGETS.has(id));
  }

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isToolAvailable(id, tool) {
    if (!tool) return false;
    if (typeof tool.available === 'boolean') return tool.available;
    if (tool.compileError || tool.status === 'missing-adapter') return false;
    return !!(
      tool.installed ||
      tool.globalInstalled ||
      tool.category === 'manual' ||
      isFileStandard(id, tool)
    );
  }

  /**
   * @param {ToolMap} tools
   * @param {'globalReady' | 'projectReady'} readiness
   */
  function availableTargets(tools, readiness) {
    return Object.entries(tools)
      .filter(([id, tool]) => isToolAvailable(id, tool) && tool[readiness])
      .map(([id]) => id);
  }

  /** @type {Record<string, string>} */
  const STATUS_LABEL = {
    connected: 'Connected',
    configurable: 'Not configured',
    missing: 'App not found',
    invalid: 'Config invalid',
    conflict: 'Conflict - review',
    'remote-required': 'Remote setup',
  };

  /** @param {string} status */
  function statusLabel(status) {
    return STATUS_LABEL[status] || status;
  }

  /** @param {string | undefined} mode */
  function modeLabel(mode) {
    if (mode === 'local-extension') return 'Desktop extension';
    if (mode === 'remote-http') return 'Remote HTTPS';
    if (mode === 'local-stdio') return 'Local MCP';
    return 'MCP';
  }

  /** @param {Array<{ id: string, title: string, body: string, done: boolean }>} steps */
  function renderHostSteps(steps) {
    if (!Array.isArray(steps) || !steps.length) return '';
    return `<ol class="mcp-host-steps">${steps
      .map((step, idx) => {
        return `<li class="mcp-step ${step.done ? 'done' : 'pending'}">
        <span class="mcp-step-num">${step.done ? 'OK' : idx + 1}</span>
        <div class="mcp-step-text">
          <strong>${esc(step.title)}</strong>
          <span>${esc(step.body)}</span>
        </div>
      </li>`;
      })
      .join('')}</ol>`;
  }

  /** @param {McpHostRecord[]} hosts @param {ToolMap=} tools */
  function renderMcpHosts(hosts, tools = {}) {
    const hostCards = hosts.map((host) => ({ kind: 'host', rank: hostRank(host), label: host.label, host }));
    const toolCards = Object.keys(tools).map((id) => ({
      kind: 'tool',
      rank: toolRank(id, tools[id]),
      label: targetLabel(id),
      id,
      tool: tools[id] || {},
    }));
    const cards = [...hostCards, ...toolCards].sort(
      (a, b) => a.rank - b.rank || a.label.localeCompare(b.label),
    );
    const html = cards
      .map((/** @type {any} */ card) => {
        if (card.kind === 'tool') return renderToolCard(card.id, card.tool);
        const host = card.host;
        const statusClass = `mcp-status-${targetClass(host.status)}`;
        const visible = host.status === 'connected' || host.appDetected !== false;
        return `<article class="mcp-host-row ${visible ? '' : 'mcp-host-muted'}" tabindex="0" role="button" onclick="CompileTab.openHostConfig('${host.id}')" onkeydown="CompileTab.handleCardKey(event, 'host', '${host.id}')">
        <div class="mcp-host-main">
          <div class="mcp-host-top">
            ${CompileConnectionView.renderLogo(host)}
            <strong>${esc(host.label)}</strong>
          </div>
          <div class="mcp-host-tags">
            <span class="ct-badge ${statusClass}">${esc(statusLabel(host.status))}</span>
            <span class="ct-badge ct-project-only">${esc(modeLabel(host.mode))}</span>
          </div>
          ${renderHostBridge(host)}
        </div>
        <div class="mcp-host-actions">
          <button class="fb small" onclick="event.stopPropagation(); CompileTab.refreshConnections()">Scan</button>
          <button class="save-btn small" onclick="event.stopPropagation(); CompileTab.openHostConfig('${host.id}')">Configure</button>
        </div>
      </article>`;
      })
      .join('');
    return html || '<div class="db-empty">No host metadata available.</div>';
  }

  /** @param {McpHostRecord} host */
  function hostRank(host) {
    if (host.status === 'connected') return 0;
    if (host.appDetected) return 1;
    if (host.status === 'remote-required') return 2;
    if (host.status === 'configurable' || host.status === 'conflict' || host.status === 'invalid') return 3;
    return 4;
  }

  /** @param {McpHostRecord} host */
  function renderHostBridge(host) {
    const rows = [];
    if (host.mode === 'local-extension') rows.push(['Extension', 'Claude Desktop MCPB bundle']);
    else if (host.mode === 'local-stdio') rows.push(['Config', host.path || '~/.codex/config.toml']);
    else if (host.mode === 'remote-http') rows.push(['Remote', 'HTTPS /mcp connector']);
    if (!rows.length) return '';
    return `<div class="ct-path"><span>CE connects</span>${rows
      .map(([name, value]) => `<code><b>${esc(name)}:</b> ${esc(value)}</code>`)
      .join('')}</div>`;
  }

  /** @param {McpHostRecord} host */
  function renderMcpHostConfig(host) {
    const statusClass = `mcp-status-${targetClass(host.status)}`;
    const pathRow = host.path
      ? `<div class="mcp-config-row">
      <span>Config path</span>
      <code>${esc(host.path)}</code>
    </div>`
      : '';
    const note = host.note ? `<p class="mcp-config-note">${esc(host.note)}</p>` : '';
    return `<div class="mcp-config-summary">
      <div class="mcp-config-status">
        <span class="ct-badge ${statusClass}">${esc(statusLabel(host.status))}</span>
        <span class="ct-badge ct-project-only">${esc(modeLabel(host.mode))}</span>
      </div>
      <p>${esc(host.summary)}</p>
      ${note}
    </div>
    <div class="mcp-config-meta">
      <div class="mcp-config-row">
        <span>Host</span>
        <strong>${esc(host.label)}</strong>
      </div>
      <div class="mcp-config-row">
        <span>Install mode</span>
        <strong>${esc(modeLabel(host.mode))}</strong>
      </div>
      ${CompileConnectionView.renderRows(host)}
      ${pathRow}
    </div>
    <div class="mcp-config-steps">
      <div class="mcp-config-section-head">
        <span class="compile-kicker">Setup</span>
        <strong>Connection checklist</strong>
      </div>
      ${renderHostSteps(host.steps || []) || '<div class="db-empty">No setup steps for this host.</div>'}
    </div>`;
  }

  /** @param {McpHostRecord} host */
  function renderMcpHostActions(host) {
    const actions = ['<button class="fb" onclick="CompileTab.closeHostConfig()">Close</button>'];
    const stepActions = (host.steps || [])
      .map((step) => step.action)
      .filter((action) => action?.href && (action.type === 'open-link' || action.type === 'docs'));
    stepActions.forEach((action) => {
      const label = action?.type === 'docs' ? 'Read docs' : 'Open setup';
      actions.push(
        `<a class="fb" href="${esc(action?.href || '')}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      );
    });
    if (host.snippet) {
      actions.push(
        `<button class="fb" onclick="CompileTab.copyMcpSnippet('${host.id}')">Copy snippet</button>`,
      );
    }
    if (host.supported) {
      const label = host.status === 'connected' ? 'Re-apply config' : 'Connect host';
      actions.push(
        `<button class="save-btn" onclick="CompileTab.installMcpHost('${host.id}')">${label}</button>`,
      );
    }
    return actions.join('');
  }

  /**
   * @param {string} id
   * @param {ToolRecord | undefined | null} tool
   */
  function toolRank(id, tool) {
    if (!tool) return 8;
    if (tool.globalInstalled) return 5;
    if (tool.detected || tool.installed) return 6;
    if (isFileStandard(id, tool)) return 7;
    if (isToolAvailable(id, tool)) return 8;
    return 9;
  }

  /** @param {string} id @param {ToolRecord} tool */
  function renderToolCard(id, tool) {
    const available = isToolAvailable(id, tool);
    const detected = isToolDetected(id, tool);
    const badges = renderToolBadges(id, tool, available);
    return `<article class="mcp-host-row compile-tool-card target-${targetClass(id)}${detected ? ' ct-detected' : ' ct-muted'}" tabindex="0" role="button" onclick="CompileTab.openToolConfig('${id}')" onkeydown="CompileTab.handleCardKey(event, 'tool', '${id}')">
      <div class="mcp-host-main">
        <div class="mcp-host-top">
          ${targetLogo(id)}
          <strong>${targetLabel(id)}</strong>
        </div>
        <div class="mcp-host-tags">${badges}</div>
        ${renderToolPath(tool, available)}
      </div>
      <div class="mcp-host-actions">
        <button class="fb small" onclick="event.stopPropagation(); CompileTab.refreshConnections()">Scan MDs</button>
        <button class="save-btn small" onclick="event.stopPropagation(); CompileTab.openToolConfig('${id}')">Configure</button>
      </div>
    </article>`;
  }

  /** @param {string} id @param {ToolRecord} tool @param {boolean} available */
  function renderToolBadges(id, tool, available) {
    const badges = [];
    if (!available) badges.push('<span class="ct-badge ct-broken">Unavailable</span>');
    if (isFileStandard(id, tool)) badges.push('<span class="ct-badge ct-project-only">File Standard</span>');
    if (available && tool.globalReady)
      badges.push('<span class="ct-badge ct-project-only">Global Writable</span>');
    if (available && tool.projectReady)
      badges.push('<span class="ct-badge ct-project-only">Project Output</span>');
    if (tool.category === 'manual') badges.push('<span class="ct-badge ct-manual">Manual / Copy</span>');
    if (tool.compileError) badges.push('<span class="ct-badge ct-broken">Format Error</span>');
    return badges.join('');
  }

  /** @param {string} id @param {ToolRecord} tool @param {boolean} available */
  function toolSummary(id, tool, available) {
    if (tool.compileError)
      return `CE can see ${targetLabel(id)}, but the adapter needs attention before syncing.`;
    if (typeof tool.description === 'string' && tool.description.trim()) return tool.description;
    if (tool.category === 'manual')
      return 'Manual surface. CE can generate the right context and copy it for this host.';
    if (tool.globalReady && tool.projectReady)
      return 'Reads shared and workspace-level instruction files generated by CE.';
    if (tool.globalReady) return 'Reads a shared instruction file generated by CE.';
    if (tool.projectReady) return 'Reads project instruction files generated by CE in registered workspaces.';
    if (available) return 'Known host surface. Configure workspaces or permissions to sync context here.';
    return 'Known host surface, but this app was not detected on this machine.';
  }

  /** @param {ToolRecord} tool @param {boolean} available */
  function renderToolPath(tool, available) {
    const outputFilename = typeof tool.outputFilename === 'string' ? tool.outputFilename : '';
    const workspaceTarget = outputFilename ? `<workspace>\\${outputFilename.replace(/\//g, '\\')}` : '';
    const targets = [];
    if (tool.globalPath) targets.push(['Global', String(tool.globalPath)]);
    if (available && tool.projectReady && workspaceTarget) targets.push(['Workspace', workspaceTarget]);
    const statusText =
      tool.compileError || (tool.globalPath && !tool.globalWritable ? 'Global path is not writable' : '');
    const label = tool.category === 'manual' ? 'CE prepares' : 'CE writes';
    return targets.length || statusText
      ? `<div class="ct-path"><span>${label}</span>${targets.map(([name, value]) => `<code><b>${esc(name)}:</b> ${esc(value)}</code>`).join('')}${statusText ? `<em>${esc(statusText)}</em>` : ''}</div>`
      : '';
  }

  /** @param {string} id @param {ToolRecord} tool @param {boolean} available */
  function renderToolAction(id, tool, available) {
    if (available && tool.category === 'manual')
      return `<button class="mem-btn small" onclick="CompileTab.copyOutput('${id}')">Copy</button>`;
    if (available && (tool.globalReady || tool.projectReady))
      return `<button class="mem-btn small" onclick="CompileTab.deployTarget('${id}')">Connect</button>`;
    return '';
  }

  /** @param {string} id @param {ToolRecord} tool */
  function renderToolConfig(id, tool) {
    const available = isToolAvailable(id, tool);
    const pathRow = tool.globalPath
      ? `<div class="mcp-config-row"><span>Global file</span><code>${esc(tool.globalPath)}</code></div>`
      : '';
    const generatedRow =
      typeof tool.outputFilename === 'string' && tool.outputFilename
        ? `<div class="mcp-config-row"><span>Generated file</span><code>${esc(tool.outputFilename)}</code></div>`
        : '';
    const signals =
      Array.isArray(tool.signals) && tool.signals.length ? tool.signals.join(', ') : 'No app signal detected';
    return `<div class="mcp-config-summary">
      <div class="mcp-config-status">${renderToolBadges(id, tool, available)}</div>
      <p>${esc(toolSummary(id, tool, available))}</p>
    </div>
    <div class="mcp-config-meta">
      <div class="mcp-config-row"><span>Host</span><strong>${esc(targetLabel(id))}</strong></div>
      <div class="mcp-config-row"><span>Transport</span><strong>${tool.category === 'manual' ? 'Manual copy' : 'Project/global files'}</strong></div>
      <div class="mcp-config-row"><span>Detection</span><strong>${esc(signals)}</strong></div>
      ${generatedRow}
      ${pathRow}
    </div>
    <div class="mcp-config-steps">
      <div class="mcp-config-section-head">
        <span class="compile-kicker">Setup</span>
        <strong>Sync checklist</strong>
      </div>
      <ol class="mcp-host-steps">
        <li class="mcp-step ${isToolDetected(id, tool) ? 'done' : 'pending'}"><span class="mcp-step-num">${isToolDetected(id, tool) ? 'OK' : '1'}</span><div class="mcp-step-text"><strong>Detect host</strong><span>Install or open the host app, then re-check hosts from this page.</span></div></li>
        <li class="mcp-step ${available ? 'done' : 'pending'}"><span class="mcp-step-num">${available ? 'OK' : '2'}</span><div class="mcp-step-text"><strong>Enable sync path</strong><span>CE can sync through writable global files, registered workspaces, or manual copy depending on this host.</span></div></li>
      </ol>
    </div>`;
  }

  /** @param {string} id @param {ToolRecord} tool */
  function renderToolActions(id, tool) {
    const available = isToolAvailable(id, tool);
    const actions = [
      '<button class="fb" onclick="SidePanel.close()">Close</button>',
      '<button class="fb" onclick="CompileTab.refreshConnections()">Re-check hosts</button>',
    ];
    if (available && tool.outputFilename) {
      actions.push(`<button class="fb" onclick="CompileTab.previewTarget('${id}')">Preview output</button>`);
    }
    actions.push(renderToolAction(id, tool, available).replace('mem-btn small', 'save-btn'));
    return actions.filter(Boolean).join('');
  }

  return {
    availableTargets,
    isToolAvailable,
    renderMcpHostActions,
    renderMcpHostConfig,
    renderMcpHosts,
    renderToolActions,
    renderToolConfig,
    statusLabel,
    targetLabel,
  };
})();
