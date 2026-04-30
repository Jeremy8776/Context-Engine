// dashboard.js - Dashboard tab

const SESS_ICONS = {
  mode_applied: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 2 2 9 8 9 7 14 14 7 8 7 9 2"/></svg>`,
  backup:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/><polyline points="5 7 8 4 11 7"/><line x1="8" y1="4" x2="8" y2="11"/></svg>`,
  toggle:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 5 4 5 8"/><path d="M5 4a7 7 0 0 1 7 7"/><polyline points="15 12 11 12 11 8"/><path d="M11 12a7 7 0 0 1-7-7"/></svg>`,
  manual_regen: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 5 4 5 8"/><path d="M5 4a7 7 0 0 1 7 7"/><polyline points="15 12 11 12 11 8"/><path d="M11 12a7 7 0 0 1-7-7"/></svg>`,
};
const HEALTH_SVG = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 7 5.5 11 12 3"/></svg>`;
const OUTPUT_LABELS = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  agents: 'AGENTS.md',
  codex: 'Codex',
  copilot: 'GitHub Copilot',
  windsurf: 'Windsurf',
  antigravity: 'Antigravity',
  kiro: 'Kiro',
  cline: 'Cline / Roo',
  aider: 'Aider',
  continue: 'Continue.dev',
  zed: 'Zed',
  junie: 'Junie',
  trae: 'Trae',
  amp: 'Amp',
  devin: 'Devin',
  goose: 'Goose',
  void: 'Void',
  augment: 'Augment',
  pearai: 'PearAI',
  ollama: 'Ollama',
  kimi: 'Kimi K2',
};

const DashboardTab = (() => {
  async function init() {
    const bar = document.getElementById('db-budget-bar');
    const lbl = document.getElementById('db-budget-label');
    if (bar) bar.style.width = '0%';
    if (lbl) lbl.textContent = 'Loading...';

    await Promise.all([loadBudget(), loadHealth(), loadBackups(), loadSessionLog(), loadModes()]);
    updateStats();
    await updateExtendedStats();
    loadOutputTokens();
  }

  function updateStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter(s => SS.active(s.id)).length;
    const tEl = document.getElementById('db-stat-total');
    const aEl = document.getElementById('db-stat-active');
    const status = document.getElementById('db-context-status');
    if (tEl && typeof animateCount !== 'undefined') animateCount(tEl, total);
    if (aEl && typeof animateCount !== 'undefined') animateCount(aEl, active);
    if (status) {
      const inactive = Math.max(total - active, 0);
      status.textContent = `${active} skills are active from ${total} discovered. Memory and rules stay shared, then Context Engine compiles the right package for each tool.`;
    }
  }

  async function updateExtendedStats() {
    // Connections: count detected tools
    try {
      const toolData = await DS.detectTools();
      const connCount = toolData ? Object.values(toolData).filter(t => t.installed).length : 0;
      const connEl = document.getElementById('db-stat-connections');
      const outputStatus = document.getElementById('db-output-status');
      const globalCount = toolData ? Object.values(toolData).filter(t => t.installed && t.supportsGlobal).length : 0;
      const projectCount = toolData ? Object.values(toolData).filter(t => t.installed && t.supportsProject).length : 0;
      if (connEl && typeof animateCount !== 'undefined') animateCount(connEl, connCount);
      if (outputStatus) {
        outputStatus.textContent = `${connCount} tools detected. ${globalCount} can inherit global context and ${projectCount} can receive workspace context.`;
      }
    } catch {}

    // Modes count
    try {
      const modesData = await DS.getModes();
      const modesCount = modesData?.modes?.length || 0;
      const modesEl = document.getElementById('db-stat-modes');
      const activeModeEl = document.getElementById('db-active-mode');
      const activeMode = localStorage.getItem('cm_active_mode');
      const mode = (modesData?.modes || []).find(m => m.id === activeMode);
      if (modesEl && typeof animateCount !== 'undefined') animateCount(modesEl, modesCount);
      if (activeModeEl) activeModeEl.textContent = mode?.label || 'Manual';
    } catch {}

    // Rules tokens (rough: chars / 4)
    const rules = RS.get();
    const rulesText = [rules.coding || '', rules.general || '', rules.soul || ''].join(' ');
    const rulesTokens = Math.ceil(rulesText.length / 4);
    const rulesEl = document.getElementById('db-rules-footprint');
    if (rulesEl) rulesEl.textContent = `${rulesTokens.toLocaleString()} tokens`;

    // Memory tokens
    const mem = MS.getData();
    const memText = (mem.entries || []).map(e => typeof e === 'string' ? e : e.content || '').join(' ');
    const memTokens = Math.ceil(memText.length / 4);
    const memoryEl = document.getElementById('db-memory-footprint');
    if (memoryEl) memoryEl.textContent = `${memTokens.toLocaleString()} tokens`;
  }

  async function loadModes() {
    const container = document.getElementById('db-mode-list');
    if (!container) return;
    try {
      const data = await DS.getModes();
      const modes = data?.modes || [];
      const activeMode = localStorage.getItem('cm_active_mode');
      if (!modes.length) {
        container.innerHTML = '<div class="db-empty">No modes yet</div>';
        return;
      }
      container.innerHTML = modes.slice(0, 8).map(mode => {
        const skills = mode.skills || [];
        const active = mode.id === activeMode ? ' active' : '';
        return `
          <button class="dashboard-mode-btn${active}" onclick="DashboardTab.applyMode('${esc(mode.id)}')">
            <span>
              <strong>${esc(mode.label || mode.id)}</strong>
              <small>${skills.length} skill${skills.length === 1 ? '' : 's'}</small>
            </span>
            <em>${active ? 'Active' : 'Apply'}</em>
          </button>`;
      }).join('');
    } catch {
      container.innerHTML = '<div class="db-empty">Modes unavailable</div>';
    }
  }

  async function loadOutputTokens() {
    const container = document.getElementById('db-output-tokens');
    if (!container) return;
    container.innerHTML = '<div class="db-empty">Estimating tool-specific outputs...</div>';
    try {
      const toolData = await DS.detectTools();
      const targets = Object.entries(toolData || {})
        .filter(([, tool]) => tool.installed && tool.supportsProject)
        .map(([id]) => id);
      if (!targets.length) {
        container.innerHTML = '<div class="db-empty">No project output targets detected</div>';
        return;
      }
      const data = await DS.compilePreview(targets);
      renderOutputTokens(data?.results || {});
    } catch {
      container.innerHTML = '<div class="db-empty">Token estimates unavailable</div>';
    }
  }

  function renderOutputTokens(results) {
    const container = document.getElementById('db-output-tokens');
    if (!container) return;
    const rows = Object.entries(results)
      .filter(([, result]) => Number.isFinite(result.tokens))
      .sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) {
      container.innerHTML = '<div class="db-empty">No token estimates yet</div>';
      return;
    }
    const max = rows[0][1].tokens || 1;
    container.innerHTML = rows.map(([id, result]) => {
      const pct = Math.max(3, Math.round((result.tokens / max) * 100));
      return `
        <div class="dashboard-token-row" data-pct="${pct}">
          <span>${esc(OUTPUT_LABELS[id] || id)}</span>
          <div class="dashboard-token-track"><i></i></div>
          <strong>~${result.tokens.toLocaleString()}</strong>
        </div>`;
    }).join('');
    container.querySelectorAll('.dashboard-token-row').forEach(row => {
      const fill = row.querySelector('i');
      if (fill) fill.style.width = `${row.dataset.pct}%`;
    });
  }

  async function discover() {
    Toast.info('Scanning for skills...');
    await loadSkillData();
    updateStats();
    await loadHealth();
    if (typeof SkillsTab !== 'undefined') SkillsTab.init();
    Toast.success(`Discovery complete: ${SKILL_DATA.length} skills found`);
  }

  async function loadBudget() {
    const data = await DS.getContextMd();
    if (!data) return;
    renderBudget(data);
  }

  function renderBudget(d) {
    const pct   = Math.min(d.budgetPercent || 0, 100);
    const tokens = (d.estimatedTokens || 0).toLocaleString();
    const bar   = document.getElementById('db-budget-bar');
    const label = document.getElementById('db-budget-label');
    const statB = document.getElementById('db-stat-budget');
    const manifest = document.getElementById('db-manifest-size');
    const compileStatus = document.getElementById('db-compile-status');

    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'budget-fill' + (pct > 90 ? ' danger' : pct > 70 ? ' warn' : '');
    }
    if (label) label.textContent = `Base manifest: ~${tokens} tokens (${pct}% of 200k context)`;
    if (statB) statB.textContent = pct + '%';
    if (manifest) manifest.textContent = `${(d.contextMdChars || 0).toLocaleString()} chars`;
    if (compileStatus) {
      compileStatus.textContent =
        `${(d.memoryChars || 0).toLocaleString()} memory chars and ${(d.rulesChars || 0).toLocaleString()} rule chars are in the shared manifest.`;
    }
  }

  async function loadHealth() {
    const data = await DS.getHealth();
    if (!data) return;
    const container = document.getElementById('db-health-list');
    const summary   = document.getElementById('db-health-summary');
    if (!container) return;
    const skills = data.skills || [];
    const issues = skills.filter(s => s.issue);
    const stale  = skills.filter(s => s.stale && !s.issue);
    const ok     = skills.filter(s => !s.issue);

    // Compact chip in the keyline head.
    if (summary) {
      if (issues.length || stale.length) {
        const parts = [];
        if (issues.length) parts.push(`<span class="chip chip-err">${issues.length} issue${issues.length>1?'s':''}</span>`);
        if (stale.length)  parts.push(`<span class="chip chip-warn">${stale.length} stale</span>`);
        parts.push(`<span class="chip chip-ok">${ok.length} ok</span>`);
        summary.innerHTML = parts.join('');
      } else {
        summary.innerHTML = `<span class="chip chip-ok">${ok.length} verified</span>`;
      }
    }

    // Clean state - single line, no list.
    if (!issues.length && !stale.length) {
      container.innerHTML = `<div class="health-ok"><span class="health-check">${HEALTH_SVG}</span>All ${ok.length} skill files verified</div>`;
      return;
    }

    // Issues present - show collapsed by default. Preview top 3, expand for all.
    const allRows = [
      ...issues.map(s => `
        <div class="health-issue" title="${esc(s.path)}">
          <span class="health-id">${esc(s.id)}</span>
          <span class="health-msg">${esc(s.issue)}</span>
        </div>`),
      ...stale.map(s => `
        <div class="health-issue stale" title="${esc(s.path)}">
          <span class="health-id">${esc(s.id)}</span>
          <span class="health-msg">Stale (${s.daysSinceModified || '30+'}d since last edit)</span>
        </div>`)
    ];
    const preview = allRows.slice(0, 3).join('');
    const rest    = allRows.slice(3).join('');
    container.innerHTML = preview +
      (rest ? `<details class="health-more"><summary>Show ${allRows.length - 3} more</summary>${rest}</details>` : '');
  }

  async function loadBackups() {
    const data = await DS.getBackups();
    if (!data) return;
    const container = document.getElementById('db-backups-list');
    if (!container) return;
    const backups = data.backups || [];
    if (!backups.length) { container.innerHTML = '<div class="db-empty">No backups yet</div>'; return; }
    container.innerHTML = backups.map(b => `
      <div class="backup-item">
        <span class="backup-ts">${b.timestamp.replace('T', ' ')}</span>
        <button class="mem-btn" onclick="DashboardTab.restore('${b.timestamp}')">Restore</button>
      </div>`).join('');
  }

  async function loadSessionLog() {
    const data = await DS.getSessionLog();
    if (!data) return;
    const container = document.getElementById('db-session-log');
    if (!container) return;
    const sessions = data.sessions || [];
    if (!sessions.length) { container.innerHTML = '<div class="db-empty">No session history yet</div>'; return; }
    container.innerHTML = sessions.slice(0, 15).map(s => {
      const ts  = new Date(s.ts).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const svg = SESS_ICONS[s.type] || SESS_ICONS.manual_regen;
      const label =
        s.type === 'mode_applied'   ? `Mode applied: ${s.mode} (${(s.skills||[]).length} skills)` :
        s.type === 'toggle'         ? `Skills toggled - ${s.activeSkills} active` :
        s.type === 'backup'         ? `Backup created: ${s.timestamp||''}` :
        s.type === 'manual_regen'   ? `CONTEXT.md regenerated - ${s.activeCount} skills` :
        s.type === 'global_install' ? `Global install - ${(s.targets||[]).join(', ')} (${s.count||0} skills)` :
        s.type === 'workspace_compile' ? `Workspace compile - ${s.workspace||'project'}` :
        s.type ? s.type.replace(/_/g,' ').replace(/^./, c=>c.toUpperCase()) : 'Event';
      return `<div class="session-item" title="${esc(JSON.stringify(s))}"><span class="session-icon">${svg}</span><span class="session-label">${esc(label)}</span><span class="session-ts">${ts}</span></div>`;
    }).join('');
  }

  async function backup() {
    Toast.info('Creating backup...');
    const r = await DS.createBackup();
    if (r?.ok) Toast.success('Backup saved');
    else Toast.error('Backup failed');
    await loadBackups();
    await loadSessionLog();
  }

  async function restore(ts) {
    const ok = await AppDialog.confirm({
      title: 'Restore backup',
      message: `Restore backup from ${ts}? This overwrites current memory, rules, and CONTEXT.md.`,
      confirmText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    const r = await DS.restoreBackup(ts);
    if (r?.ok) {
      await Promise.all([MS.loadFromServer(), RS.loadFromServer(), SS.loadFromServer()]);
      await loadBudget();
      if (typeof MemoryTab !== 'undefined') MemoryTab.init();
      if (typeof ConfigTab  !== 'undefined') ConfigTab.init();
      Toast.success('Restored successfully');
    } else Toast.error('Restore failed');
  }

  async function regenCONTEXTmd() {
    Toast.info('Regenerating...');
    const r = await DS.regenContextMd();
    if (r?.ok) Toast.success('CONTEXT.md regenerated');
    else Toast.error('Failed');
    await loadBudget();
    await loadSessionLog();
  }

  async function applyMode(modeId) {
    if (typeof ModesTab === 'undefined') return;
    await ModesTab.apply(modeId);
    await Promise.all([loadModes(), loadBudget(), loadSessionLog()]);
    updateStats();
    await updateExtendedStats();
  }

  async function installGlobals() {
    if (typeof CompileTab === 'undefined') return;
    await CompileTab.installAllDetected();
    await Promise.all([loadSessionLog(), updateExtendedStats()]);
  }

  async function compileWorkspaces() {
    if (typeof CompileTab === 'undefined') return;
    await CompileTab.compileAllWorkspaces();
    await Promise.all([loadSessionLog(), updateExtendedStats()]);
  }

  async function previewOutput() {
    if (typeof CompileTab === 'undefined') return;
    await CompileTab.preview();
    await loadOutputTokens();
    openTab('compile');
  }

  function openTab(name) {
    switchTabByName(name);
  }

  async function refreshBudget() { await loadBudget(); }

  return {
    init,
    backup,
    restore,
    regenCONTEXTmd,
    discover,
    refreshBudget,
    loadSessionLog,
    applyMode,
    installGlobals,
    compileWorkspaces,
    previewOutput,
    openTab,
    loadOutputTokens,
  };
})();
