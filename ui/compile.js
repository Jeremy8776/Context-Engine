// compile.js -- Connections tab sync orchestration.

// @ts-check

/** @typedef {Record<string, ToolRecord>} ToolMap */
/** @typedef {{ ok?: boolean, error?: string, installed?: Record<string, { path: string }>, workspaces?: WorkspaceRecord[], results?: Record<string, unknown>, content?: string, filename?: string, tokens?: number }} CompileResult */

const CompileTab = (() => {
  /** @type {ToolMap} */
  let detectedTools = {};
  /** @type {WorkspaceRecord[]} */
  let workspaces = [];
  /** @type {McpHostRecord[]} */
  let mcpHosts = [];
  /** @type {string | null} */
  let activeHostConfig = null;
  /** @type {string | null} */
  let activeToolConfig = null;

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isToolAvailable(id, tool) {
    return CompileView.isToolAvailable(id, tool);
  }

  function availableGlobalTargets() {
    return CompileView.availableTargets(detectedTools, 'globalReady');
  }

  function availableProjectTargets() {
    return CompileView.availableTargets(detectedTools, 'projectReady');
  }

  async function init() {
    const [toolData, wsData, hostData] = await Promise.all([
      DS.detectTools(),
      DS.getWorkspaces(),
      DS.getMcpHosts(),
    ]);
    if (toolData) detectedTools = toolData;
    if (wsData && wsData.workspaces) workspaces = wsData.workspaces;
    if (hostData?.hosts) mcpHosts = hostData.hosts;
    renderReadiness();
    renderMcpHosts();
  }

  function renderReadiness() {
    const container = document.getElementById('compile-connection-status');
    if (!container) return;
    container.innerHTML = CompileConnectionView.renderPageStatus(null, { hosts: mcpHosts });
  }

  function renderMcpHosts() {
    const container = document.getElementById('mcp-hosts-list');
    if (!container) return;
    container.innerHTML = CompileView.renderMcpHosts(mcpHosts, detectedTools);
    if (SidePanel.isOpen() && (activeHostConfig || activeToolConfig)) renderHostConfigPanel();
  }

  async function refreshMcpHosts() {
    await refreshConnections();
  }

  async function refreshConnections() {
    const [toolData, hostData] = await Promise.all([DS.detectTools(), DS.getMcpHosts()]);
    if (toolData) detectedTools = toolData;
    if (hostData?.hosts) mcpHosts = hostData.hosts;
    renderMcpHosts();
    renderReadiness();
    Toast.success('Connections re-checked');
  }

  /** @param {string} hostId */
  function openHostConfig(hostId) {
    activeHostConfig = hostId;
    activeToolConfig = null;
    renderHostConfigPanel();
  }

  /** @param {MouseEvent=} event */
  function closeHostConfig(event) {
    void event;
    SidePanel.close();
    activeHostConfig = null;
    activeToolConfig = null;
  }

  /** @param {string} targetId */
  function openToolConfig(targetId) {
    activeToolConfig = targetId;
    activeHostConfig = null;
    renderHostConfigPanel();
  }

  function renderHostConfigPanel() {
    if (activeHostConfig) {
      const host = mcpHosts.find((item) => item.id === activeHostConfig);
      if (!host) return;
      SidePanel.open(
        host.label,
        `<div class="sp-detail">${CompileView.renderMcpHostConfig(host)}<div class="sp-actions">${CompileView.renderMcpHostActions(host)}</div></div>`,
      );
      return;
    }
    if (activeToolConfig) {
      const tool = detectedTools[activeToolConfig];
      if (!tool) return;
      SidePanel.open(
        CompileView.targetLabel(activeToolConfig),
        `<div class="sp-detail">${CompileView.renderToolConfig(activeToolConfig, tool)}<div id="host-preview-output"></div><div class="sp-actions">${CompileView.renderToolActions(activeToolConfig, tool)}</div></div>`,
      );
    }
  }

  /** @param {KeyboardEvent} event @param {'host' | 'tool'} kind @param {string} id */
  function handleCardKey(event, kind, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (kind === 'host') openHostConfig(id);
    else openToolConfig(id);
  }

  /** @param {string} targetId */
  async function installGlobal(targetId) {
    const targets = [targetId];
    Toast.info(`Updating ${CompileView.targetLabel(targetId)}...`);
    /** @type {CompileResult | null} */
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      const installed = result.installed || {};
      Toast.success(
        `Updated ${Object.values(installed)
          .map(/** @param {{ path: string }} i */ (i) => i.path)
          .join(', ')}`,
      );
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderMcpHosts();
    } else {
      Toast.error(result?.error || 'Install failed');
    }
  }

  async function installAllDetected() {
    const targets = availableGlobalTargets();
    if (!targets.length) {
      Toast.warn('No detected tools with global support');
      return;
    }
    Toast.info(`Updating ${targets.length} global output(s)...`);
    /** @type {CompileResult | null} */
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      Toast.success(`Updated ${Object.keys(result.installed || {}).length} global output(s)`);
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderMcpHosts();
    }
  }

  /** @param {string} hostId */
  async function installMcpHost(hostId) {
    const host = mcpHosts.find((item) => item.id === hostId);
    if (!host?.supported) {
      Toast.warn('This host needs a separate adapter');
      return;
    }
    const confirmed = await AppDialog.confirm({
      title: `Connect ${host.label}`,
      message: host.path
        ? `Context Engine will update only its own MCP entry in ${host.path}.`
        : 'Context Engine will update this host config.',
      confirmText: 'Connect',
    });
    if (!confirmed) return;
    const result = await DS.installMcpHost(hostId);
    if (result?.ok) {
      Toast.success(`${host.label} connected`);
      await refreshMcpHosts();
      renderReadiness();
    } else {
      Toast.error(result?.error || 'Host config update failed');
    }
  }

  /** @param {string} hostId */
  async function copyMcpSnippet(hostId) {
    const host = mcpHosts.find((item) => item.id === hostId);
    if (!host?.snippet) return;
    try {
      await navigator.clipboard.writeText(host.snippet);
      Toast.success(`${host.label} snippet copied`);
    } catch {
      Toast.error('Clipboard access denied');
    }
  }

  /** @param {string} targetId */
  async function deployTarget(targetId) {
    const tool = detectedTools[targetId];
    if (!isToolAvailable(targetId, tool)) {
      Toast.warn('Target is not available');
      return;
    }
    if (!tool) return;
    if (tool.globalReady) {
      await installGlobal(targetId);
      return;
    }
    if (tool.projectReady) {
      const wsData = await DS.getWorkspaces();
      if (wsData?.workspaces) workspaces = wsData.workspaces;
      if (!workspaces.length) {
        Toast.warn('Add a workspace before updating project outputs');
        return;
      }
      Toast.info(`Updating ${CompileView.targetLabel(targetId)} in ${workspaces.length} workspace(s)...`);
      /** @type {CompileResult | null} */
      const result = await DS.compileWorkspaces([targetId], null);
      if (result?.ok) {
        workspaces = result.workspaces || workspaces;
        renderMcpHosts();
        Toast.success(`Updated ${Object.keys(result.results || {}).length} workspace(s)`);
      } else {
        Toast.error(result?.error || 'Workspace update failed');
      }
      return;
    }
    await copyOutput(targetId);
  }

  async function deployAllAvailable() {
    const [toolData, wsData] = await Promise.all([DS.detectTools(), DS.getWorkspaces()]);
    if (toolData) detectedTools = toolData;
    if (wsData?.workspaces) workspaces = wsData.workspaces;

    const globalTargets = availableGlobalTargets();
    const projectTargets = availableProjectTargets();
    const tasks = [];
    let globalCount = 0;
    let workspaceCount = 0;
    const errors = [];

    if (globalTargets.length) {
      tasks.push(
        DS.installGlobal(globalTargets).then((result) => {
          if (!result?.ok) throw new Error(result?.error || 'Global update failed');
          globalCount = Object.keys(result.installed || {}).length;
        }),
      );
    }

    if (workspaces.length && projectTargets.length) {
      tasks.push(
        DS.compileWorkspaces(projectTargets, null).then((result) => {
          if (!result?.ok) throw new Error(result?.error || 'Workspace compile failed');
          workspaceCount = Object.keys(result.results || {}).length;
          workspaces = result.workspaces || workspaces;
          if (Array.isArray(result.errors) && result.errors.length) errors.push(...result.errors);
        }),
      );
    }

    if (!tasks.length) {
      Toast.warn('No automatic deployment targets are available');
      return;
    }

    Toast.info(
      `Updating ${globalTargets.length} global target(s) and ${workspaces.length ? projectTargets.length : 0} workspace target(s)...`,
    );
    try {
      await Promise.all(tasks);
      const refreshed = await DS.detectTools();
      if (refreshed) detectedTools = refreshed;
      renderMcpHosts();
      const message = `Updated ${globalCount} global output(s)${workspaceCount ? ` and ${workspaceCount} workspace(s)` : ''}`;
      if (errors.length) Toast.warn(`${message}; ${errors.length} workspace issue(s)`);
      else Toast.success(message);
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : 'Deployment failed');
    }
  }

  async function compileAllWorkspaces() {
    if (!workspaces.length) {
      Toast.warn('No workspaces registered');
      return;
    }
    const targets = availableProjectTargets();
    if (!targets.length) {
      Toast.warn('No available project outputs');
      return;
    }
    Toast.info(`Compiling to ${workspaces.length} workspace(s)...`);
    const result = await DS.compileWorkspaces(targets, null);
    if (result?.ok) {
      workspaces = result.workspaces;
      Toast.success(`Compiled to ${Object.keys(result.results).length} workspace(s)`);
    }
  }

  /** @param {string} targetId */
  async function copyOutput(targetId) {
    Toast.info('Generating...');
    const data = await DS.compilePreview([targetId]);
    if (!data || !data.results || !data.results[targetId]) {
      Toast.error('Failed');
      return;
    }
    try {
      await navigator.clipboard.writeText(data.results[targetId].content);
      Toast.success(`${CompileView.targetLabel(targetId)} output copied to clipboard`);
    } catch {
      Toast.error('Clipboard access denied');
    }
  }

  /** @param {string} targetId */
  async function previewTarget(targetId) {
    const target = detectedTools[targetId];
    if (!target) return;
    Toast.info(`Generating ${CompileView.targetLabel(targetId)} preview...`);
    const data = await DS.compilePreview([targetId]);
    const result = data?.results?.[targetId];
    const container = document.getElementById('host-preview-output');
    if (!result || !container) {
      Toast.error('Preview unavailable');
      return;
    }
    container.innerHTML = `<div class="mcp-config-steps">
      <div class="mcp-config-section-head">
        <span class="compile-kicker">Preview</span>
        <strong>${esc(result.filename || targetId)}</strong>
      </div>
      <pre class="context-preview compile-preview-content">${esc(result.content || '')}</pre>
    </div>`;
    Toast.success('Preview generated');
  }

  return {
    init,
    installGlobal,
    installAllDetected,
    deployTarget,
    deployAllAvailable,
    copyOutput,
    renderMcpHosts,
    refreshMcpHosts,
    refreshConnections,
    openHostConfig,
    openToolConfig,
    closeHostConfig,
    handleCardKey,
    installMcpHost,
    copyMcpSnippet,
    previewTarget,
    compileAllWorkspaces,
  };
})();
