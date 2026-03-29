// compile.js — Cross-tool compiler tab

const CompileTab = (() => {
  let targets = [];
  let lastResults = null;
  let activePreview = null;

  const TARGET_META = {
    claude:       { label: 'Claude Code',      color: '#8b5cf6' },
    cursor:       { label: 'Cursor',           color: '#3b82f6' },
    agents:       { label: 'AGENTS.md',        color: '#10b981' },
    copilot:      { label: 'GitHub Copilot',   color: '#f59e0b' },
    windsurf:     { label: 'Windsurf',         color: '#ec4899' },
    antigravity:  { label: 'Antigravity',      color: '#4285f4' },
    kiro:         { label: 'Kiro (AWS)',       color: '#ff9900' },
    cline:        { label: 'Cline / Roo',      color: '#06b6d4' },
    aider:        { label: 'Aider',            color: '#84cc16' },
    continue:     { label: 'Continue.dev',     color: '#be185d' },
    zed:          { label: 'Zed',              color: '#a3e635' },
    junie:        { label: 'Junie (JetBrains)',color: '#fe315d' },
    trae:         { label: 'Trae',             color: '#22d3ee' },
    ollama:       { label: 'Ollama',           color: '#f8f8f8' },
    kimi:         { label: 'Kimi K2',          color: '#6366f1' },
  };

  async function init() {
    const data = await DS.getCompileTargets();
    if (data && data.targets) {
      targets = data.targets;
      renderTargets();
    }
  }

  function renderTargets() {
    const container = document.getElementById('compile-targets');
    if (!container) return;
    container.innerHTML = targets.map(t => {
      const meta = TARGET_META[t.id] || { label: t.id, color: 'var(--p1)' };
      return `
        <label class="compile-target-item">
          <input type="checkbox" checked value="${t.id}" class="compile-target-check">
          <span class="compile-target-dot" style="background:${meta.color}"></span>
          <span class="compile-target-label">${meta.label}</span>
          <span class="compile-target-file">${t.filename}</span>
        </label>`;
    }).join('');
  }

  function getSelectedTargets() {
    const checks = document.querySelectorAll('.compile-target-check:checked');
    return Array.from(checks).map(c => c.value);
  }

  async function preview() {
    const selected = getSelectedTargets();
    if (!selected.length) { Toast.warn('Select at least one target'); return; }

    Toast.info('Generating preview...');
    const data = await DS.compilePreview(selected);
    if (!data) return;

    lastResults = data.results;
    renderSummary(data);
    renderPreviewTabs(data.results);
    showPreviewCard();

    const firstTarget = Object.keys(data.results)[0];
    if (firstTarget) showPreview(firstTarget);
    Toast.success('Preview generated');
  }

  async function compile() {
    const selected = getSelectedTargets();
    if (!selected.length) { Toast.warn('Select at least one target'); return; }

    Toast.info('Compiling...');
    const data = await DS.compile(selected);
    if (!data || !data.ok) { Toast.error('Compilation failed'); return; }

    lastResults = data.results;
    renderSummary(data);
    renderPreviewTabs(data.results);
    showPreviewCard();

    const firstTarget = Object.keys(data.results)[0];
    if (firstTarget) showPreview(firstTarget);

    if (data.errors && data.errors.length) {
      data.errors.forEach(e => Toast.warn(e));
    }
    Toast.success(`Compiled ${Object.keys(data.results).length} target(s) — files written to disk`);

    if (typeof DashboardTab !== 'undefined') DashboardTab.refreshBudget();
  }

  function showPreviewCard() {
    const card = document.getElementById('compile-preview-card');
    if (card) card.style.display = '';
  }

  function renderSummary(data) {
    const container = document.getElementById('compile-summary');
    if (!container) return;
    const results = data.results || {};
    const errors = data.errors || [];
    const ctx = data.context || {};

    let html = `<div class="compile-stat-row">
      <span class="compile-stat">${ctx.activeSkills || 0}/${ctx.totalSkills || 0} skills</span>
    </div>`;

    html += Object.entries(results).map(([id, r]) => {
      const meta = TARGET_META[id] || { label: id, color: 'var(--t2)' };
      return `<div class="compile-result-row">
        <span class="compile-target-dot" style="background:${meta.color}"></span>
        <span class="compile-result-name">${meta.label}</span>
        <span class="compile-result-file">${r.filename}</span>
        <span class="compile-result-tokens">~${r.tokens.toLocaleString()} tokens</span>
      </div>`;
    }).join('');

    if (errors.length) {
      html += errors.map(e => `<div class="compile-error">${e}</div>`).join('');
    }

    container.innerHTML = html;
  }

  function renderPreviewTabs(results) {
    const container = document.getElementById('compile-preview-tabs');
    if (!container) return;
    container.innerHTML = Object.keys(results).map(id => {
      const meta = TARGET_META[id] || { label: id, color: 'var(--t2)' };
      return `<button class="compile-tab-btn ${activePreview === id ? 'active' : ''}"
                onclick="CompileTab.showPreview('${id}')"
                style="--tab-color:${meta.color}">${meta.label}</button>`;
    }).join('');
  }

  function showPreview(targetId) {
    activePreview = targetId;
    const content = document.getElementById('compile-preview-content');
    if (!content || !lastResults || !lastResults[targetId]) return;
    content.textContent = lastResults[targetId].content;
    renderPreviewTabs(lastResults);
  }

  return { init, compile, preview, showPreview };
})();
