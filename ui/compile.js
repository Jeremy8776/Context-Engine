// compile.js — Cross-tool compiler tab v4 (stepped wizard flow)

// @ts-check

/** @typedef {{ label: string, logo?: string }} TargetMeta */
/** @typedef {Record<string, ToolRecord>} ToolMap */
/** @typedef {{ ok?: boolean, error?: string, installed?: Record<string, { path: string }>, workspaces?: WorkspaceRecord[], results?: Record<string, unknown>, content?: string, filename?: string, tokens?: number }} CompileResult */

const CompileTab = (() => {
  /** @type {ToolMap} */
  let detectedTools = {};
  /** @type {WorkspaceRecord[]} */
  let workspaces = [];
  /** @type {Record<string, CompilePreviewResult> | null} */
  let lastResults = null;
  /** @type {string | null} */
  let activePreview = null;
  let currentStep = 1;

  const TARGET_META = {
    claude:      { label: 'Claude Code', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg' },
    cursor:      { label: 'Cursor', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cursor.svg' },
    agents:      { label: 'AGENTS.md', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/markdown.svg' },
    codex:       { label: 'Codex', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/97/OpenAI_logo_2025.svg' },
    copilot:     { label: 'GitHub Copilot', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/githubcopilot.svg' },
    windsurf:    { label: 'Windsurf', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/windsurf.svg' },
    antigravity: { label: 'Antigravity', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/google.svg' },
    kiro:        { label: 'Kiro', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Aws_logo.svg' },
    cline:       { label: 'Cline / Roo', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cline.svg' },
    aider:       { label: 'Aider', logo: 'https://aider.chat/assets/logo.svg' },
    continue:    { label: 'Continue.dev', logo: 'https://raw.githubusercontent.com/continuedev/continue/main/extensions/vscode/media/sidebar-icon.png' },
    zed:         { label: 'Zed', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/zedindustries.svg' },
    junie:       { label: 'Junie', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/jetbrains.svg' },
    trae:        { label: 'Trae', logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/trae.svg' },
    amp:         { label: 'Amp', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sourcegraph-logo-light.svg' },
    devin:       { label: 'Devin', logo: 'https://static.cdnlogo.com/logos/d/97/devin.svg' },
    goose:       { label: 'Goose', logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/goose.svg' },
    void:        { label: 'Void', logo: 'https://static.cdnlogo.com/logos/v/51/void.svg' },
    augment:     { label: 'Augment', logo: 'https://static.cdnlogo.com/logos/a/44/augment-code.svg' },
    pearai:      { label: 'PearAI', logo: 'assets/logos/pearai.svg' },
    ollama:      { label: 'Ollama', logo: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/ollama.svg' },
    kimi:        { label: 'Kimi K2', logo: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/kimi-ai.svg' },
  };

  const FILE_STANDARD_TARGETS = new Set(['agents', 'aider', 'copilot']);

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isFileStandard(id, tool) {
    return !!(tool?.fileStandard || FILE_STANDARD_TARGETS.has(id));
  }

  /** @param {string} id @param {ToolRecord | undefined | null} tool */
  function isToolAvailable(id, tool) {
    if (!tool) return false;
    if (typeof tool.available === 'boolean') return tool.available;
    if (tool.compileError || tool.status === 'missing-adapter') return false;
    return !!(tool.installed || tool.globalInstalled || tool.category === 'manual' || isFileStandard(id, tool));
  }

  function availableGlobalTargets() {
    return Object.entries(detectedTools)
      .filter(([id, tool]) => isToolAvailable(id, tool) && tool.globalReady)
      .map(([id]) => id);
  }

  function availableProjectTargets() {
    return Object.entries(detectedTools)
      .filter(([id, tool]) => isToolAvailable(id, tool) && tool.projectReady)
      .map(([id]) => id);
  }

  /** @param {string} id */
  function targetClass(id) {
    return String(id || 'target').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }

  /** @param {string} id */
  function targetLogo(id) {
    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    const meta = targetMeta[id] || { label: id };
    if (!meta.logo) return '';
    return `<span class="compile-target-logo target-${targetClass(id)}"><img src="${esc(meta.logo)}" alt="" loading="lazy"></span>`;
  }

  /** @param {number} n */
  function highlightStep(n) {
    currentStep = n;
    document.querySelectorAll('.cs-step').forEach(el => {
      const stepEl = /** @type {HTMLElement} */ (el);
      stepEl.classList.toggle('active', parseInt(stepEl.dataset.step || '0') <= n);
    });
  }

  async function init() {
    const [toolData, wsData] = await Promise.all([
      DS.detectTools(),
      DS.getWorkspaces(),
    ]);
    if (toolData) detectedTools = toolData;
    if (wsData && wsData.workspaces) workspaces = wsData.workspaces;
    highlightStep(1);
    renderTools();
    renderWorkspaces();
  }

  /** @param {string} strategy */
  function selectStrategy(strategy) {
    document.getElementById('strategy-global')?.classList.toggle('selected', strategy === 'global');
    document.getElementById('strategy-workspace')?.classList.toggle('selected', strategy === 'workspace');
    highlightStep(2);
  }

  // ---- TOOL DETECTION GRID ----
  function renderTools() {
    const container = document.getElementById('compile-tools-grid');
    if (!container) return;

    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    const ids = Object.keys(detectedTools).sort((a, b) => {
      const ai = isToolAvailable(a, detectedTools[a]) ? 0 : 1;
      const bi = isToolAvailable(b, detectedTools[b]) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return (targetMeta[a]?.label || a).localeCompare(targetMeta[b]?.label || b);
    });
    if (!ids.length) { container.innerHTML = '<div class="db-empty">No output targets are registered.</div>'; return; }

    container.innerHTML = ids.map(id => {
      const t = detectedTools[id] || {};
      const meta = targetMeta[id] || { label: id, logo: undefined };
      const installed = t.installed;
      const globalActive = t.globalInstalled;
      const isManual = t.category === 'manual';
      const available = isToolAvailable(id, t);
      const projectReady = !!(available && t.projectReady);
      const globalReady = !!(available && t.globalReady);
      const fileStandard = isFileStandard(id, t);

      let badges = '';
      if (!available) badges += '<span class="ct-badge ct-broken">Unavailable</span>';
      if (installed) badges += '<span class="ct-badge ct-installed">Tool Detected</span>';
      else if (fileStandard) badges += '<span class="ct-badge ct-project-only">File Standard</span>';
      else if (!isManual) badges += '<span class="ct-badge ct-notfound">App Not Detected</span>';
      if (globalActive) badges += '<span class="ct-badge ct-global-active">Global Active</span>';
      if (globalReady) badges += '<span class="ct-badge ct-project-only">Global Writable</span>';
      if (projectReady) badges += '<span class="ct-badge ct-project-only">Project Output</span>';
      if (isManual) badges += '<span class="ct-badge ct-manual">Manual / Copy</span>';
      if (t.compileError) badges += '<span class="ct-badge ct-broken">Format Error</span>';

      let action = '';
      if (globalReady) {
        action = `<button class="mem-btn" onclick="CompileTab.installGlobal('${id}')">Update</button>`;
      } else if (available && isManual) {
        action = `<button class="mem-btn" onclick="CompileTab.copyOutput('${id}')">Copy</button>`;
      } else if (projectReady) {
        action = `<button class="mem-btn" onclick="CompileTab.deployTarget('${id}')">Update</button>`;
      }

      const statusText = t.compileError || (t.globalPath && !t.globalWritable ? 'Global path is not writable' : '');
      const pathInfo = t.globalPath || statusText
        ? `<div class="ct-path">${esc([t.globalPath, statusText].filter(Boolean).join(' - '))}</div>` : '';
      const cardState = available ? ' ct-detected' : ' ct-muted';

      return `<div class="compile-tool-card target-${targetClass(id)}${cardState}">
        <div class="ct-header">
          ${targetLogo(id)}
          <span class="ct-label">${meta.label}</span>
        </div>
        <div class="ct-badges">${badges}</div>
        ${pathInfo}
        <div class="ct-actions">${action}</div>
      </div>`;
    }).join('');

  }

  // ---- WORKSPACES ----
  function renderWorkspaces() {
    const container = document.getElementById('compile-workspaces-list');
    if (!container) return;

    if (!workspaces.length) {
      container.innerHTML = '<div class="db-empty">No workspaces registered. Add a project directory below.</div>';
      return;
    }

    container.innerHTML = workspaces.map(/** @param {WorkspaceRecord} ws */ (ws) => `
      <div class="compile-ws-row">
        <div class="ws-info">
          <span class="ws-label">${esc(ws.label)}</span>
          <span class="ws-path">${esc(ws.path)}</span>
          ${ws.lastCompiled ? `<span class="ws-compiled">Last compiled: ${ws.lastCompiled}</span>` : '<span class="ws-compiled">Never compiled</span>'}
        </div>
        <div class="ws-actions">
          <button class="mem-btn save" onclick="CompileTab.compileToWorkspace('${esc(ws.path.replace(/\\/g, '\\\\'))}')">Compile</button>
          <button class="mem-btn danger" onclick="CompileTab.removeWorkspace('${esc(ws.path.replace(/\\/g, '\\\\'))}')">Remove</button>
        </div>
      </div>`).join('');
  }

  // ---- ACTIONS ----
  /** @param {string} targetId */
  async function installGlobal(targetId) {
    const targets = [targetId];
    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    Toast.info(`Updating ${targetMeta[targetId]?.label || targetId}...`);
    /** @type {CompileResult | null} */
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      const installed = result.installed || {};
      Toast.success(`Updated ${Object.values(installed).map(/** @param {{ path: string }} i */ (i) => i.path).join(', ')}`);
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderTools();
      highlightStep(3);
    } else {
      Toast.error(result?.error || 'Install failed');
    }
  }

  async function installAllDetected() {
    const targets = availableGlobalTargets();
    if (!targets.length) { Toast.warn('No detected tools with global support'); return; }
    Toast.info(`Updating ${targets.length} global output(s)...`);
    /** @type {CompileResult | null} */
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      Toast.success(`Updated ${Object.keys(result.installed || {}).length} global output(s)`);
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderTools();
      highlightStep(3);
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
      const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
      Toast.info(`Updating ${targetMeta[targetId]?.label || targetId} in ${workspaces.length} workspace(s)...`);
      /** @type {CompileResult | null} */
      const result = await DS.compileWorkspaces([targetId], null);
      if (result?.ok) {
        workspaces = result.workspaces || workspaces;
        renderWorkspaces();
        highlightStep(3);
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
      tasks.push(DS.installGlobal(globalTargets).then(result => {
        if (!result?.ok) throw new Error(result?.error || 'Global update failed');
        globalCount = Object.keys(result.installed || {}).length;
      }));
    }

    if (workspaces.length && projectTargets.length) {
      tasks.push(DS.compileWorkspaces(projectTargets, null).then(result => {
        if (!result?.ok) throw new Error(result?.error || 'Workspace compile failed');
        workspaceCount = Object.keys(result.results || {}).length;
        workspaces = result.workspaces || workspaces;
        if (Array.isArray(result.errors) && result.errors.length) errors.push(...result.errors);
      }));
    }

    if (!tasks.length) {
      Toast.warn('No automatic deployment targets are available');
      return;
    }

    Toast.info(`Updating ${globalTargets.length} global target(s) and ${workspaces.length ? projectTargets.length : 0} workspace target(s)...`);
    try {
      await Promise.all(tasks);
      const refreshed = await DS.detectTools();
      if (refreshed) detectedTools = refreshed;
      renderTools();
      renderWorkspaces();
      highlightStep(3);
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
    if (!wsPath) { pathInput.focus(); return; }

    const result = await DS.addWorkspace(wsPath, label);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      pathInput.value = '';
      labelInput.value = '';
      Toast.success('Workspace added');
      highlightStep(2);
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
    if (!targets.length) { Toast.warn('No available project outputs'); return; }
    Toast.info('Compiling...');
    const result = await DS.compileWorkspaces(targets, wsPath);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      const firstKey = Object.keys(result.results)[0];
      const wsResult = firstKey ? result.results[firstKey] : null;
      Toast.success(`Compiled ${wsResult?.targets?.length || 0} targets`);
      highlightStep(3);
    }
  }

  async function compileAllWorkspaces() {
    if (!workspaces.length) { Toast.warn('No workspaces registered'); return; }
    const targets = availableProjectTargets();
    if (!targets.length) { Toast.warn('No available project outputs'); return; }
    Toast.info(`Compiling to ${workspaces.length} workspace(s)...`);
    const result = await DS.compileWorkspaces(targets, null);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      Toast.success(`Compiled to ${Object.keys(result.results).length} workspace(s)`);
      highlightStep(3);
    }
  }

  /** @param {string} targetId */
  async function copyOutput(targetId) {
    Toast.info('Generating...');
    const data = await DS.compilePreview([targetId]);
    if (!data || !data.results || !data.results[targetId]) { Toast.error('Failed'); return; }
    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    try {
      await navigator.clipboard.writeText(data.results[targetId].content);
      Toast.success(`${targetMeta[targetId]?.label || targetId} output copied to clipboard`);
    } catch {
      Toast.error('Clipboard access denied');
    }
  }

  // ---- PREVIEW ----
  async function preview() {
    const allTargets = availableProjectTargets();
    if (!allTargets.length) { Toast.warn('No targets available'); return; }

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
    highlightStep(3);
    Toast.success('Preview generated');
  }

  /** @param {{ results?: Record<string, CompilePreviewResult>, context?: { activeSkills?: number, totalSkills?: number } }} data */
  function renderSummary(data) {
    const container = document.getElementById('compile-summary');
    if (!container) return;
    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    /** @type {Record<string, CompilePreviewResult>} */
    const results = data.results || {};
    const ctx = data.context || {};

    let html = `<div class="compile-stat-row">
      <span class="compile-stat">${ctx.activeSkills || 0}/${ctx.totalSkills || 0} skills</span>
    </div>`;

    html += Object.entries(results).map(([id, r]) => {
      const meta = targetMeta[id] || { label: id };
      return `<div class="compile-result-row">
        ${targetLogo(id)}
        <span class="compile-result-name">${meta.label}</span>
        <span class="compile-result-file">${r.filename}</span>
        <span class="compile-result-tokens">~${r.tokens.toLocaleString()} tokens</span>
      </div>`;
    }).join('');

    container.innerHTML = html;
  }

  /** @param {Record<string, CompilePreviewResult>} results */
  function renderPreviewTabs(results) {
    const container = document.getElementById('compile-preview-tabs');
    if (!container) return;
    const targetMeta = /** @type {Record<string, TargetMeta>} */ (TARGET_META);
    container.innerHTML = Object.keys(results).map(id => {
      const meta = targetMeta[id] || { label: id };
      return `<button class="compile-tab-btn ${activePreview === id ? 'active' : ''}"
                onclick="CompileTab.showPreview('${id}')">${meta.label}</button>`;
    }).join('');
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
    init, preview, showPreview, selectStrategy, highlightStep,
    installGlobal, installAllDetected, deployTarget, deployAllAvailable, copyOutput,
    addWorkspace, removeWorkspace, compileToWorkspace, compileAllWorkspaces,
  };
})();
