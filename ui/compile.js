// compile.js -- Outputs tab runtime bridge orchestration.

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
  /** @type {{ ok?: boolean, ready?: boolean, chunks?: number, skills?: number, model?: string|null, updatedAt?: string|null } | null} */
  let indexStatus = null;
  let indexBuilding = false;
  /** @type {Record<string, CompilePreviewResult> | null} */
  let lastResults = null;
  /** @type {string | null} */
  let activePreview = null;
  /** @type {string | null} */
  let activeHostConfig = null;

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
    const [toolData, wsData, hostData, idxData] = await Promise.all([
      DS.detectTools(),
      DS.getWorkspaces(),
      DS.getMcpHosts(),
      DS.getIndexStatus(),
    ]);
    if (toolData) detectedTools = toolData;
    if (wsData && wsData.workspaces) workspaces = wsData.workspaces;
    if (hostData?.hosts) mcpHosts = hostData.hosts;
    indexStatus = normalizeIndexStatus(idxData);
    renderReadiness();
    renderIndex();
    renderTools();
    renderMcpHosts();
    renderWorkspaces();
  }

  /** @param {*} raw @returns {typeof indexStatus} */
  function normalizeIndexStatus(raw) {
    if (!raw) return null;
    return {
      ok: raw.ok !== false,
      ready: (raw.chunks || 0) > 0,
      chunks: raw.chunks || 0,
      skills: raw.skills || 0,
      model: raw.model || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  function renderReadiness() {
    const container = document.getElementById('compile-readiness');
    if (!container) return;
    container.innerHTML = CompileView.renderReadinessBanner(indexStatus, { hosts: mcpHosts });
  }

  function renderIndex() {
    const container = document.getElementById('compile-index-status');
    if (!container) return;
    container.innerHTML = CompileView.renderIndexStatus(indexStatus, indexBuilding);
    // Reflect the building state on the Build button so the user can't fire
    // a second build while one is in flight.
    const buildBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('#compile-tab .index-card .compile-card-actions .save-btn'));
    if (buildBtn) {
      buildBtn.disabled = indexBuilding;
      buildBtn.textContent = indexBuilding ? 'Building...' : 'Build / rebuild';
    }
  }

  async function refreshIndexStatus() {
    const data = await DS.getIndexStatus();
    indexStatus = normalizeIndexStatus(data);
    renderIndex();
    renderReadiness();
  }

  async function buildIndex() {
    if (indexBuilding) return;
    const confirmed = await AppDialog.confirm({
      title: 'Build vector index',
      message:
        'CE will embed every active skill chunk using your configured embeddings model. This can take a minute on a cold cache.',
      confirmText: 'Build',
    });
    if (!confirmed) return;
    indexBuilding = true;
    renderIndex();
    renderReadiness();
    Toast.info('Building index...');
    try {
      const result = await DS.indexSkills();
      if (result?.ok) {
        indexStatus = normalizeIndexStatus(result);
        Toast.success(`Indexed ${result.chunks || 0} chunks across ${result.skills || 0} skills`);
      } else {
        Toast.error(result?.error || 'Index build failed');
      }
    } finally {
      indexBuilding = false;
      renderIndex();
      renderReadiness();
    }
  }

  function renderMcpHosts() {
    const container = document.getElementById('mcp-hosts-list');
    if (!container) return;
    container.innerHTML = CompileView.renderMcpHosts(mcpHosts);
    renderHostConfigModal();
  }

  async function refreshMcpHosts() {
    const data = await DS.getMcpHosts();
    if (data?.hosts) {
      mcpHosts = data.hosts;
      renderMcpHosts();
      renderReadiness();
      Toast.success('Host status refreshed');
    }
  }

  /** @param {string} hostId */
  function openHostConfig(hostId) {
    activeHostConfig = hostId;
    renderHostConfigModal();
    const overlay = document.getElementById('mcp-host-modal-overlay');
    overlay?.classList.add('open');
    requestAnimationFrame(() => {
      const action = overlay?.querySelector('.save-btn, .fb');
      if (action instanceof HTMLElement) action.focus();
    });
  }

  /** @param {MouseEvent=} event */
  function closeHostConfig(event) {
    if (event && event.target instanceof HTMLElement && event.target.id !== 'mcp-host-modal-overlay') return;
    document.getElementById('mcp-host-modal-overlay')?.classList.remove('open');
    activeHostConfig = null;
  }

  function renderHostConfigModal() {
    if (!activeHostConfig) return;
    const host = mcpHosts.find((item) => item.id === activeHostConfig);
    const title = document.getElementById('mcp-host-modal-title');
    const body = document.getElementById('mcp-host-modal-body');
    const actions = document.getElementById('mcp-host-modal-actions');
    if (!host || !title || !body || !actions) return;
    title.textContent = `Configure ${host.label}`;
    body.innerHTML = CompileView.renderMcpHostConfig(host);
    actions.innerHTML = CompileView.renderMcpHostActions(host);
  }

  // ---- TOOL DETECTION GRID ----
  function renderTools() {
    const container = document.getElementById('compile-tools-grid');
    if (!container) return;
    container.innerHTML = CompileView.renderTools(detectedTools);
    renderFallbackSummary();
  }

  // ---- WORKSPACES ----
  function renderWorkspaces() {
    const container = document.getElementById('compile-workspaces-list');
    if (!container) return;
    container.innerHTML = CompileView.renderWorkspaces(workspaces);
    renderFallbackSummary();
  }

  function renderFallbackSummary() {
    const container = document.getElementById('compile-fallback-summary');
    if (!container) return;
    container.innerHTML = CompileView.renderFallbackSummary(detectedTools, workspaces);
  }

  // ---- ACTIONS ----
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
      renderTools();
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
      renderTools();
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
        renderWorkspaces();
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
      renderTools();
      renderWorkspaces();
      const message = `Updated ${globalCount} global output(s)${workspaceCount ? ` and ${workspaceCount} workspace(s)` : ''}`;
      if (errors.length) Toast.warn(`${message}; ${errors.length} workspace issue(s)`);
      else Toast.success(message);
    } catch (e) {
      Toast.error(e instanceof Error ? e.message : 'Deployment failed');
    }
  }

  async function addWorkspace() {
    const pathInput = /** @type {HTMLInputElement | null} */ (document.getElementById('ws-path-input'));
    const labelInput = /** @type {HTMLInputElement | null} */ (document.getElementById('ws-label-input'));
    if (!pathInput || !labelInput) return;
    const wsPath = pathInput.value.trim();
    const label = labelInput.value.trim();
    if (!wsPath) {
      pathInput.focus();
      return;
    }

    const result = await DS.addWorkspace(wsPath, label);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      pathInput.value = '';
      labelInput.value = '';
      Toast.success('Workspace added');
    }
  }

  /** @param {string} wsPath */
  async function removeWorkspace(wsPath) {
    const result = await DS.removeWorkspace(wsPath);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      Toast.success('Workspace removed');
    }
  }

  /** @param {string} wsPath */
  async function compileToWorkspace(wsPath) {
    const targets = availableProjectTargets();
    if (!targets.length) {
      Toast.warn('No available project outputs');
      return;
    }
    Toast.info('Compiling...');
    const result = await DS.compileWorkspaces(targets, wsPath);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      const firstKey = Object.keys(result.results)[0];
      const wsResult = firstKey ? result.results[firstKey] : null;
      Toast.success(`Compiled ${wsResult?.targets?.length || 0} targets`);
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
      renderWorkspaces();
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

  // ---- PREVIEW ----
  async function preview() {
    const allTargets = availableProjectTargets();
    if (!allTargets.length) {
      Toast.warn('No targets available');
      return;
    }

    Toast.info('Generating preview...');
    const data = await DS.compilePreview(allTargets);
    if (!data) return;

    lastResults = data.results;
    renderSummary(data);
    renderPreviewTabs(data.results);
    const previewCard = document.getElementById('compile-preview-card');
    if (previewCard) previewCard.hidden = false;

    const firstTarget = Object.keys(data.results)[0];
    if (firstTarget) showPreview(firstTarget);
    Toast.success('Preview generated');
  }

  /** @param {{ results?: Record<string, CompilePreviewResult>, context?: { activeSkills?: number, totalSkills?: number } }} data */
  function renderSummary(data) {
    const container = document.getElementById('compile-summary');
    if (!container) return;
    /** @type {Record<string, CompilePreviewResult>} */
    const results = data.results || {};
    container.innerHTML = CompileView.renderSummary({ ...data, results });
  }

  /** @param {Record<string, CompilePreviewResult>} results */
  function renderPreviewTabs(results) {
    const container = document.getElementById('compile-preview-tabs');
    if (!container) return;
    container.innerHTML = CompileView.renderPreviewTabs(results, activePreview);
  }

  /** @param {string} targetId */
  function showPreview(targetId) {
    activePreview = targetId;
    const content = document.getElementById('compile-preview-content');
    if (!content || !lastResults || !lastResults[targetId]) return;
    content.textContent = lastResults[targetId].content;
    renderPreviewTabs(lastResults);
  }

  return {
    init,
    preview,
    showPreview,
    installGlobal,
    installAllDetected,
    deployTarget,
    deployAllAvailable,
    copyOutput,
    renderMcpHosts,
    refreshMcpHosts,
    openHostConfig,
    closeHostConfig,
    installMcpHost,
    copyMcpSnippet,
    refreshIndexStatus,
    buildIndex,
    addWorkspace,
    removeWorkspace,
    compileToWorkspace,
    compileAllWorkspaces,
  };
})();
