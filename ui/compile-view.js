// compile-view.js -- Rendering and target rules for the Outputs tab.

// @ts-check

const CompileView = (() => {
  const TARGET_META = {
    claude: { label: 'Claude Code', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg' },
    cursor: { label: 'Cursor', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cursor.svg' },
    agents: { label: 'AGENTS.md', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/markdown.svg' },
    codex: {
      label: 'Codex',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/9/97/OpenAI_logo_2025.svg',
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

  const FILE_STANDARD_TARGETS = new Set(['agents', 'aider', 'copilot']);

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
    if (mode === 'remote-http') return 'Remote HTTPS';
    if (mode === 'local-stdio') return 'Local MCP';
    return 'MCP';
  }

  /** @param {{ ok?: boolean, ready?: boolean, chunks?: number, skills?: number, model?: string|null, updatedAt?: string|null }|null} status @param {{ hosts: McpHostRecord[] }} ctx */
  function renderReadinessBanner(status, ctx) {
    const hosts = ctx.hosts || [];
    const local = hosts.filter((h) => h.supported);
    const connected = local.filter((h) => h.status === 'connected').length;
    const indexReady = !!status?.ready;
    const tone = indexReady && connected > 0 ? 'ready' : connected > 0 || indexReady ? 'partial' : 'pending';
    const headline =
      tone === 'ready'
        ? 'Context Engine is reachable as MCP'
        : tone === 'partial'
          ? 'Almost there - finish setup below'
          : 'Set up the runtime bridge to start using CE';
    const indexLine = indexReady
      ? `${(status?.chunks || 0).toLocaleString()} chunks indexed across ${(status?.skills || 0).toLocaleString()} skills`
      : 'Vector index is empty - build it before running searches';
    const hostsLine = local.length
      ? `${connected} / ${local.length} local host${local.length === 1 ? '' : 's'} connected`
      : 'No local hosts available';
    return `<div class="readiness-banner readiness-${tone}">
      <div class="readiness-dot"></div>
      <div class="readiness-text">
        <strong>${esc(headline)}</strong>
        <span class="readiness-meta">${esc(indexLine)} / ${esc(hostsLine)}</span>
      </div>
    </div>`;
  }

  /** @param {{ ok?: boolean, ready?: boolean, chunks?: number, skills?: number, model?: string|null, updatedAt?: string|null }|null} status @param {boolean=} building */
  function renderIndexStatus(status, building = false) {
    if (!status) return '<div class="db-empty">Loading index status...</div>';
    const ready = !!status.ready;
    const chunks = status.chunks || 0;
    const skills = status.skills || 0;
    const model = status.model || 'no model';
    const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : 'never';
    const tone = building ? 'index-building' : ready ? 'index-ready' : 'index-empty';
    const badgeText = building ? 'Building...' : ready ? 'Ready' : 'Empty';
    const badgeClass = building ? 'ct-pending' : ready ? 'ct-installed' : 'ct-broken';
    return `<div class="index-status ${tone}">
      <div class="index-status-row">
        <span class="ct-badge ${badgeClass}">${badgeText}</span>
        <span class="index-line"><strong>${chunks.toLocaleString()}</strong> chunks / <strong>${skills.toLocaleString()}</strong> skills</span>
        <span class="index-meta">model: ${esc(model)} / last built: ${esc(updated)}</span>
      </div>
      ${building ? '<div class="index-progress" role="progressbar" aria-label="Indexing in progress"><div class="index-progress-bar"></div></div>' : ''}
      ${ready || building ? '' : `<p class="index-help">Searches return nothing until the index is built. The "Build / rebuild" action above embeds every active skill chunk into the local vector store using your configured embeddings model.</p>`}
      ${building ? '<p class="index-help">Embedding skill chunks via your configured model. This typically takes 30-90 seconds depending on skill count and whether the model is warm.</p>' : ''}
    </div>`;
  }

  /** @param {Array<{ id: string, title: string, body: string, done: boolean, action?: { type: string, href?: string, hostId?: string } }>} steps @param {string} hostId @param {boolean=} includeActions */
  function renderHostSteps(steps, hostId, includeActions = true) {
    if (!Array.isArray(steps) || !steps.length) return '';
    return `<ol class="mcp-host-steps">${steps
      .map((step, idx) => {
        const action = includeActions ? renderStepAction(step.action, hostId) : '';
        return `<li class="mcp-step ${step.done ? 'done' : 'pending'}">
        <span class="mcp-step-num">${step.done ? 'OK' : idx + 1}</span>
        <div class="mcp-step-text">
          <strong>${esc(step.title)}</strong>
          <span>${esc(step.body)}</span>
        </div>
        ${action ? `<div class="mcp-step-action">${action}</div>` : ''}
      </li>`;
      })
      .join('')}</ol>`;
  }

  /** @param {{ type: string, href?: string, hostId?: string }|undefined} action @param {string} hostId */
  function renderStepAction(action, hostId) {
    if (!action) return '';
    if (action.type === 'install') {
      return `<button class="mem-btn save" onclick="CompileTab.installMcpHost('${hostId}')">Connect</button>`;
    }
    if (action.type === 'copy-snippet') {
      return `<button class="mem-btn" onclick="CompileTab.copyMcpSnippet('${hostId}')">Copy snippet</button>`;
    }
    if (action.type === 'open-link' && action.href) {
      return `<a class="mem-btn" href="${esc(action.href)}" target="_blank" rel="noopener noreferrer">Open</a>`;
    }
    if (action.type === 'docs' && action.href) {
      return `<a class="mem-btn" href="${esc(action.href)}" target="_blank" rel="noopener noreferrer">Read docs</a>`;
    }
    return '';
  }

  /** @param {McpHostRecord[]} hosts */
  function renderMcpHosts(hosts) {
    if (!hosts.length) return '<div class="db-empty">No MCP host metadata available.</div>';
    return hosts
      .map((host) => {
        const statusClass = `mcp-status-${targetClass(host.status)}`;
        const detected =
          typeof host.appDetected === 'boolean'
            ? `<span class="ct-badge ${host.appDetected ? 'ct-installed' : 'ct-notfound'}">${host.appDetected ? 'App detected' : 'App not detected'}</span>`
            : '';
        return `<article class="mcp-host-row ${host.supported ? '' : 'mcp-host-disabled'}">
        <div class="mcp-host-main">
          <div class="mcp-host-top">
            <strong>${esc(host.label)}</strong>
            <span class="ct-badge ${statusClass}">${esc(statusLabel(host.status))}</span>
            <span class="ct-badge ct-project-only">${esc(modeLabel(host.mode))}</span>
            ${detected}
          </div>
          <p>${esc(host.summary)}</p>
        </div>
        <div class="mcp-host-actions">
          <button class="save-btn small" onclick="CompileTab.openHostConfig('${host.id}')">Configure</button>
        </div>
      </article>`;
      })
      .join('');
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
      ${pathRow}
    </div>
    <div class="mcp-config-steps">
      <div class="mcp-config-section-head">
        <span class="compile-kicker">Setup</span>
        <strong>Connection checklist</strong>
      </div>
      ${renderHostSteps(host.steps || [], host.id, false) || '<div class="db-empty">No setup steps for this host.</div>'}
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

  /** @param {ToolMap} tools */
  function renderTools(tools) {
    const ids = Object.keys(tools).sort((a, b) => {
      const ai = isToolAvailable(a, tools[a]) ? 0 : 1;
      const bi = isToolAvailable(b, tools[b]) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return targetLabel(a).localeCompare(targetLabel(b));
    });
    if (!ids.length) return '<div class="db-empty">No output targets are registered.</div>';
    return ids.map((id) => renderToolCard(id, tools[id] || {})).join('');
  }

  /** @param {string} id @param {ToolRecord} tool */
  function renderToolCard(id, tool) {
    const available = isToolAvailable(id, tool);
    const badges = renderToolBadges(id, tool, available);
    const pathInfo = renderToolPath(tool);
    const action = renderToolAction(id, tool, available);
    return `<div class="compile-tool-card target-${targetClass(id)}${available ? ' ct-detected' : ' ct-muted'}">
      <div class="ct-header">
        ${targetLogo(id)}
        <span class="ct-label">${targetLabel(id)}</span>
      </div>
      <div class="ct-badges">${badges}</div>
      ${pathInfo}
      <div class="ct-actions">${action}</div>
    </div>`;
  }

  /** @param {string} id @param {ToolRecord} tool @param {boolean} available */
  function renderToolBadges(id, tool, available) {
    const badges = [];
    if (!available) badges.push('<span class="ct-badge ct-broken">Unavailable</span>');
    if (tool.installed) badges.push('<span class="ct-badge ct-installed">Tool Detected</span>');
    else if (isFileStandard(id, tool))
      badges.push('<span class="ct-badge ct-project-only">File Standard</span>');
    else if (tool.category !== 'manual')
      badges.push('<span class="ct-badge ct-notfound">App Not Detected</span>');
    if (tool.globalInstalled) badges.push('<span class="ct-badge ct-global-active">Global Active</span>');
    if (available && tool.globalReady)
      badges.push('<span class="ct-badge ct-project-only">Global Writable</span>');
    if (available && tool.projectReady)
      badges.push('<span class="ct-badge ct-project-only">Project Output</span>');
    if (tool.category === 'manual') badges.push('<span class="ct-badge ct-manual">Manual / Copy</span>');
    if (tool.compileError) badges.push('<span class="ct-badge ct-broken">Format Error</span>');
    return badges.join('');
  }

  /** @param {ToolRecord} tool */
  function renderToolPath(tool) {
    const statusText =
      tool.compileError || (tool.globalPath && !tool.globalWritable ? 'Global path is not writable' : '');
    return tool.globalPath || statusText
      ? `<div class="ct-path">${esc([tool.globalPath, statusText].filter(Boolean).join(' - '))}</div>`
      : '';
  }

  /** @param {string} id @param {ToolRecord} tool @param {boolean} available */
  function renderToolAction(id, tool, available) {
    if (available && tool.category === 'manual')
      return `<button class="mem-btn" onclick="CompileTab.copyOutput('${id}')">Copy output</button>`;
    return '';
  }

  /** @param {ToolMap} tools @param {WorkspaceRecord[]} workspaces */
  function renderFallbackSummary(tools, workspaces) {
    const globalCount = availableTargets(tools, 'globalReady').length;
    const projectCount = availableTargets(tools, 'projectReady').length;
    const manualCount = Object.entries(tools).filter(
      ([id, tool]) => isToolAvailable(id, tool) && tool.category === 'manual',
    ).length;
    return [
      `<span><strong>${globalCount}</strong> global writable</span>`,
      `<span><strong>${projectCount}</strong> project targets</span>`,
      `<span><strong>${workspaces.length}</strong> workspaces</span>`,
      manualCount ? `<span><strong>${manualCount}</strong> manual copy</span>` : '',
    ]
      .filter(Boolean)
      .join('');
  }

  /** @param {WorkspaceRecord[]} items */
  function renderWorkspaces(items) {
    if (!items.length)
      return '<div class="db-empty">No workspaces registered. Add a project directory below.</div>';
    return items
      .map((ws) => {
        const escapedPath = esc(ws.path.replace(/\\/g, '\\\\'));
        return `<div class="compile-ws-row">
        <div class="ws-info">
          <span class="ws-label">${esc(ws.label)}</span>
          <span class="ws-path">${esc(ws.path)}</span>
          ${ws.lastCompiled ? `<span class="ws-compiled">Last compiled: ${ws.lastCompiled}</span>` : '<span class="ws-compiled">Never compiled</span>'}
        </div>
        <div class="ws-actions">
          <button class="mem-btn save" onclick="CompileTab.compileToWorkspace('${escapedPath}')">Compile</button>
          <button class="mem-btn danger" onclick="CompileTab.removeWorkspace('${escapedPath}')">Remove</button>
        </div>
      </div>`;
      })
      .join('');
  }

  /** @param {{ results?: Record<string, CompilePreviewResult>, context?: { activeSkills?: number, totalSkills?: number } }} data */
  function renderSummary(data) {
    const results = data.results || {};
    const ctx = data.context || {};
    return `<div class="compile-stat-row">
      <span class="compile-stat">${ctx.activeSkills || 0}/${ctx.totalSkills || 0} skills</span>
    </div>${Object.entries(results)
      .map(
        ([id, result]) => `<div class="compile-result-row">
      ${targetLogo(id)}
      <span class="compile-result-name">${targetLabel(id)}</span>
      <span class="compile-result-file">${result.filename}</span>
      <span class="compile-result-tokens">~${result.tokens.toLocaleString()} tokens</span>
    </div>`,
      )
      .join('')}`;
  }

  /** @param {Record<string, CompilePreviewResult>} results @param {string | null} activeId */
  function renderPreviewTabs(results, activeId) {
    return Object.keys(results)
      .map(
        (id) => `<button class="compile-tab-btn ${activeId === id ? 'active' : ''}"
      onclick="CompileTab.showPreview('${id}')">${targetLabel(id)}</button>`,
      )
      .join('');
  }

  return {
    availableTargets,
    isToolAvailable,
    renderIndexStatus,
    renderFallbackSummary,
    renderMcpHostActions,
    renderMcpHostConfig,
    renderMcpHosts,
    renderPreviewTabs,
    renderReadinessBanner,
    renderSummary,
    renderTools,
    renderWorkspaces,
    statusLabel,
    targetLabel,
  };
})();
