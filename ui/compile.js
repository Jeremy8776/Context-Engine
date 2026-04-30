// compile.js — Cross-tool compiler tab v4 (stepped wizard flow)

const CompileTab = (() => {
  let detectedTools = {};
  let workspaces = [];
  let lastResults = null;
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

  function targetClass(id) {
    return String(id || 'target').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }

  function targetLogo(id) {
    const meta = TARGET_META[id] || {};
    if (!meta.logo) return '';
    return `<span class="compile-target-logo target-${targetClass(id)}"><img src="${esc(meta.logo)}" alt="" loading="lazy"></span>`;
  }

  function highlightStep(n) {
    currentStep = n;
    document.querySelectorAll('.cs-step').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.step) <= n);
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

  function selectStrategy(strategy) {
    document.getElementById('strategy-global')?.classList.toggle('selected', strategy === 'global');
    document.getElementById('strategy-workspace')?.classList.toggle('selected', strategy === 'workspace');
    highlightStep(2);
  }

  // ---- TOOL DETECTION GRID ----
  function renderTools() {
    const container = document.getElementById('compile-tools-grid');
    if (!container) return;

    const ids = Object.keys(detectedTools).sort((a, b) => {
      const ai = detectedTools[a].installed ? 0 : 1;
      const bi = detectedTools[b].installed ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return (TARGET_META[a]?.label || a).localeCompare(TARGET_META[b]?.label || b);
    });
    if (!ids.length) { container.innerHTML = '<div class="db-empty">No output targets are registered.</div>'; return; }

    container.innerHTML = ids.map(id => {
      const t = detectedTools[id];
      const meta = TARGET_META[id] || { label: id };
      const installed = t.installed;
      const globalActive = t.globalInstalled;
      const isManual = t.category === 'manual';
      const projectReady = t.supportsProject && (installed || isManual);

      let badges = '';
      if (installed) badges += '<span class="ct-badge ct-installed">Installed</span>';
      else if (!isManual) badges += '<span class="ct-badge ct-notfound">Not Found</span>';
      if (globalActive) badges += '<span class="ct-badge ct-global-active">Global Active</span>';
      if (projectReady) badges += '<span class="ct-badge ct-project-only">Project Ready</span>';
      if (isManual) badges += '<span class="ct-badge ct-manual">Manual / Copy</span>';

      let action = '';
      if (t.supportsGlobal && installed && !globalActive) {
        action = `<button class="mem-btn save" onclick="CompileTab.installGlobal('${id}')">Install</button>`;
      } else if (t.supportsGlobal && globalActive) {
        action = `<button class="mem-btn" onclick="CompileTab.installGlobal('${id}')">Update</button>`;
      } else if (isManual) {
        action = `<button class="mem-btn" onclick="CompileTab.copyOutput('${id}')">Copy</button>`;
      }

      const pathInfo = t.globalPath ? `<div class="ct-path">${esc(t.globalPath)}</div>` : '';
      const cardState = installed || isManual ? ' ct-detected' : ' ct-muted';

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

    container.innerHTML = workspaces.map(ws => `
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
  async function installGlobal(targetId) {
    const targets = [targetId];
    Toast.info(`Installing ${TARGET_META[targetId]?.label || targetId} globally...`);
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      Toast.success(`Installed to ${Object.values(result.installed).map(i => i.path).join(', ')}`);
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderTools();
      highlightStep(3);
    } else {
      Toast.error(result?.error || 'Install failed');
    }
  }

  async function installAllDetected() {
    const targets = Object.entries(detectedTools)
      .filter(([, t]) => t.installed && t.supportsGlobal)
      .map(([id]) => id);
    if (!targets.length) { Toast.warn('No detected tools with global support'); return; }
    Toast.info(`Installing ${targets.length} tools globally...`);
    const result = await DS.installGlobal(targets);
    if (result?.ok) {
      Toast.success(`Installed ${Object.keys(result.installed).length} tool(s) globally`);
      const toolData = await DS.detectTools();
      if (toolData) detectedTools = toolData;
      renderTools();
      highlightStep(3);
    }
  }

  async function addWorkspace() {
    const pathInput = document.getElementById('ws-path-input');
    const labelInput = document.getElementById('ws-label-input');
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

  async function removeWorkspace(wsPath) {
    const result = await DS.removeWorkspace(wsPath);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      Toast.success('Workspace removed');
    }
  }

  async function compileToWorkspace(wsPath) {
    Toast.info('Compiling...');
    const result = await DS.compileWorkspaces(null, wsPath);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      const wsResult = result.results[Object.keys(result.results)[0]];
      Toast.success(`Compiled ${wsResult?.targets?.length || 0} targets`);
      highlightStep(3);
    }
  }

  async function compileAllWorkspaces() {
    if (!workspaces.length) { Toast.warn('No workspaces registered'); return; }
    Toast.info(`Compiling to ${workspaces.length} workspace(s)...`);
    const result = await DS.compileWorkspaces(null, null);
    if (result?.ok) {
      workspaces = result.workspaces;
      renderWorkspaces();
      Toast.success(`Compiled to ${Object.keys(result.results).length} workspace(s)`);
      highlightStep(3);
    }
  }

  async function copyOutput(targetId) {
    Toast.info('Generating...');
    const data = await DS.compilePreview([targetId]);
    if (!data || !data.results || !data.results[targetId]) { Toast.error('Failed'); return; }
    try {
      await navigator.clipboard.writeText(data.results[targetId].content);
      Toast.success(`${TARGET_META[targetId]?.label || targetId} output copied to clipboard`);
    } catch {
      Toast.error('Clipboard access denied');
    }
  }

  // ---- PREVIEW ----
  async function preview() {
    const allTargets = Object.keys(detectedTools).filter(id => detectedTools[id].supportsProject);
    if (!allTargets.length) { Toast.warn('No targets available'); return; }

    Toast.info('Generating preview...');
    const data = await DS.compilePreview(allTargets);
    if (!data) return;

    lastResults = data.results;
    renderSummary(data);
    renderPreviewTabs(data.results);
    document.getElementById('compile-preview-card').hidden = false;

    const firstTarget = Object.keys(data.results)[0];
    if (firstTarget) showPreview(firstTarget);
    highlightStep(3);
    Toast.success('Preview generated');
  }

  function renderSummary(data) {
    const container = document.getElementById('compile-summary');
    if (!container) return;
    const results = data.results || {};
    const ctx = data.context || {};

    let html = `<div class="compile-stat-row">
      <span class="compile-stat">${ctx.activeSkills || 0}/${ctx.totalSkills || 0} skills</span>
    </div>`;

    html += Object.entries(results).map(([id, r]) => {
      const meta = TARGET_META[id] || { label: id };
      return `<div class="compile-result-row">
        ${targetLogo(id)}
        <span class="compile-result-name">${meta.label}</span>
        <span class="compile-result-file">${r.filename}</span>
        <span class="compile-result-tokens">~${r.tokens.toLocaleString()} tokens</span>
      </div>`;
    }).join('');

    container.innerHTML = html;
  }

  function renderPreviewTabs(results) {
    const container = document.getElementById('compile-preview-tabs');
    if (!container) return;
    container.innerHTML = Object.keys(results).map(id => {
      const meta = TARGET_META[id] || { label: id };
      return `<button class="compile-tab-btn ${activePreview === id ? 'active' : ''}"
                onclick="CompileTab.showPreview('${id}')">${meta.label}</button>`;
    }).join('');
  }

  function showPreview(targetId) {
    activePreview = targetId;
    const content = document.getElementById('compile-preview-content');
    if (!content || !lastResults || !lastResults[targetId]) return;
    content.textContent = lastResults[targetId].content;
    renderPreviewTabs(lastResults);
  }

  return {
    init, preview, showPreview, selectStrategy, highlightStep,
    installGlobal, installAllDetected, copyOutput,
    addWorkspace, removeWorkspace, compileToWorkspace, compileAllWorkspaces,
  };
})();
