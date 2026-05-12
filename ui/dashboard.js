// @ts-check
// dashboard.js - Dashboard tab

/** @typedef {{ issue?: string, stale?: boolean, daysSinceModified?: number, id: string, path?: string }} HealthSkillRecord */
/** @typedef {{ tokens?: number, filename?: string, content?: string }} DashboardCompileResult */

const SESS_ICONS = {
  mode_applied: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 2 2 9 8 9 7 14 14 7 8 7 9 2"/></svg>`,
  backup: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/><polyline points="5 7 8 4 11 7"/><line x1="8" y1="4" x2="8" y2="11"/></svg>`,
  toggle: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 5 4 5 8"/><path d="M5 4a7 7 0 0 1 7 7"/><polyline points="15 12 11 12 11 8"/><path d="M11 12a7 7 0 0 1-7-7"/></svg>`,
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
const DASH_FILE_STANDARD_TARGETS = new Set(['agents', 'copilot']);

/**
 * @param {string} id
 * @param {ToolRecord | undefined | null} tool
 * @returns {boolean}
 */
function isDashboardOutputAvailable(id, tool) {
  if (!tool) return false;
  if (typeof tool.available === 'boolean') return tool.available;
  if (tool.compileError || tool.status === 'missing-adapter') return false;
  return !!(
    tool.installed ||
    tool.globalInstalled ||
    tool.category === 'manual' ||
    DASH_FILE_STANDARD_TARGETS.has(id)
  );
}

const DashboardTab = (() => {
  async function init() {
    const bar = document.getElementById('db-budget-bar');
    const lbl = document.getElementById('db-budget-label');
    if (bar) bar.style.width = '0%';
    if (lbl) lbl.textContent = 'Loading...';

    await Promise.all([
      loadBudget(),
      loadHealth(),
      loadBackups(),
      loadSessionLog(),
      loadModes(),
      loadIndexStatus(),
    ]);
    updateStats();
    await updateExtendedStats();
    loadOutputTokens();
  }

  function updateStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter((s) => SS.active(s.id)).length;
    const tEl = document.getElementById('db-stat-total');
    const aEl = document.getElementById('db-stat-active');
    const status = document.getElementById('db-context-status');
    if (tEl && typeof animateCount !== 'undefined') animateCount(tEl, total);
    if (aEl && typeof animateCount !== 'undefined') animateCount(aEl, active);
    if (status) {
      const inactive = Math.max(total - active, 0);
      status.textContent = `${active} skills are active from ${total} discovered. Memory and rules stay shared, then Context Engine syncs the right package to each host surface.`;
    }
  }

  async function updateExtendedStats() {
    // Connections: count detected tools
    try {
      const toolData = await DS.detectTools();
      const tools = Object.entries(toolData || {});
      const connCount = tools.filter(([id, tool]) => isDashboardOutputAvailable(id, tool)).length;
      const connEl = document.getElementById('db-stat-connections');
      const outputStatus = document.getElementById('db-output-status');
      const globalCount = tools.filter(
        ([id, tool]) => isDashboardOutputAvailable(id, tool) && tool.globalReady,
      ).length;
      const projectCount = tools.filter(
        ([id, tool]) => isDashboardOutputAvailable(id, tool) && tool.projectReady,
      ).length;
      if (connEl && typeof animateCount !== 'undefined') animateCount(connEl, connCount);
      if (outputStatus) {
        outputStatus.textContent = `${connCount} sync surfaces are available. ${globalCount} can inherit global context and ${projectCount} can receive workspace context.`;
      }
    } catch {}

    // Modes count
    try {
      const modesData = await DS.getModes();
      const modesCount = modesData?.modes?.length || 0;
      const modesEl = document.getElementById('db-stat-modes');
      const activeModeEl = document.getElementById('db-active-mode');
      const activeMode = localStorage.getItem('cm_active_mode');
      const mode = (modesData?.modes || []).find(/** @param {{ id: string }} m */ (m) => m.id === activeMode);
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
    const memText = (mem.entries || []).map((e) => (typeof e === 'string' ? e : e.content || '')).join(' ');
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
      container.innerHTML = modes
        .slice(0, 8)
        .map(
          /** @param {{ id: string, label?: string, skills?: unknown[] }} mode */ (mode) => {
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
          },
        )
        .join('');
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
        .filter(([id, tool]) => isDashboardOutputAvailable(id, tool) && tool.projectReady)
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

  /** @param {Record<string, { tokens: number }>} results */
  function renderOutputTokens(results) {
    const container = document.getElementById('db-output-tokens');
    if (!container) return;
    /** @type {Array<[string, { tokens: number }]>} */
    const rows = /** @type {Array<[string, { tokens: number }]>} */ (Object.entries(results))
      .filter(([, result]) => Number.isFinite(result.tokens))
      .sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) {
      container.innerHTML = '<div class="db-empty">No token estimates yet</div>';
      return;
    }
    const firstRow = rows[0];
    const max = (firstRow && firstRow[1].tokens) || 1;
    container.innerHTML = rows
      .map(([id, result]) => {
        const pct = Math.max(3, Math.round((result.tokens / max) * 100));
        const label = /** @type {Record<string, string>} */ (OUTPUT_LABELS)[id] || id;
        return `
        <div class="dashboard-token-row" data-pct="${pct}">
          <span>${esc(label)}</span>
          <div class="dashboard-token-track"><i></i></div>
          <strong>~${result.tokens.toLocaleString()}</strong>
        </div>`;
      })
      .join('');
    container.querySelectorAll('.dashboard-token-row').forEach((row) => {
      const el = /** @type {HTMLElement} */ (row);
      const fill = /** @type {HTMLElement | null} */ (el.querySelector('i'));
      if (fill) fill.style.width = `${el.dataset.pct}%`;
    });
  }

  async function discover() {
    Toast.info('Scanning for skills...');
    await loadSkillData();
    updateStats();
    await loadHealth();
    if (typeof SkillsTab !== 'undefined') SkillsTab.init?.();
    Toast.success(`Discovery complete: ${SKILL_DATA.length} skills found`);
  }

  async function loadIndexStatus() {
    const status = document.getElementById('db-index-status');
    if (!status) return;
    try {
      const data = await DS.getIndexStatus();
      if (!data?.chunks) {
        status.innerHTML =
          '<span class="ct-badge ct-broken">Empty</span><span>Build the index before hosts can use live semantic search.</span>';
        return;
      }
      const time = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'unknown time';
      const stale = !!data.stale;
      const badge = stale
        ? '<span class="ct-badge ct-warn">Stale</span>'
        : '<span class="ct-badge ct-installed">Ready</span>';
      const staleNote = stale
        ? `<span class="db-index-stale">Skill set changed (${esc(data.staleReason || 'sources updated')}) — rebuild to reflect it in search results.</span>`
        : '';
      status.innerHTML = `${badge}<strong>${Number(data.chunks).toLocaleString()} chunks / ${Number(data.skills || 0).toLocaleString()} skills</strong><code>model: ${esc(data.model || 'unknown model')} / updated: ${esc(time)}</code>${staleNote}`;
    } catch {
      status.innerHTML =
        '<span class="ct-badge ct-broken">Unavailable</span><span>Vector index status unavailable.</span>';
    }
  }

  async function refreshIndexStatus() {
    await loadIndexStatus();
    Toast.success('Vector index status refreshed');
  }

  async function smartCompile() {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('db-smart-task'));
    const result = document.getElementById('db-smart-result');
    if (!input || !result) return;
    const task = (input.value || '').trim();
    if (!task) {
      Toast.warn('Describe the task first');
      input.focus();
      return;
    }
    result.hidden = false;
    result.innerHTML = '<div class="db-empty">Selecting skills for this task&hellip;</div>';
    Toast.info('Running smart compile...');
    const data = await DS.smartCompile({ task });
    if (!data || data.ok === false) {
      const msg = (data && data.error) || 'Smart compile failed';
      result.innerHTML = `<div class="db-empty">${esc(msg)}</div>`;
      Toast.warn(msg);
      return;
    }
    renderSmartResult(result, data);
    Toast.success(`Smart compile picked ${data.selectedSkillIds?.length || 0} skills`);
  }

  /**
   * @param {HTMLElement} host
   * @param {{ selectedSkillIds: string[], matches: Array<{ skillId: string, score: number, hits: number }>, budget: { selectedTokens: number, allOnTokens: number, savedTokens: number, maxTokens: number }, stack?: { tags: string[], summary?: string } }} data
   */
  function renderSmartResult(host, data) {
    const selected = data.selectedSkillIds || [];
    const budget = data.budget || { selectedTokens: 0, allOnTokens: 0, savedTokens: 0, maxTokens: 0 };
    const tags = (data.stack && data.stack.tags) || [];
    const sel = Number(budget.selectedTokens || 0);
    const all = Number(budget.allOnTokens || 0);
    const saved = Number(budget.savedTokens || 0);
    const pct = all > 0 ? Math.round((sel / all) * 100) : 0;
    const matches = (data.matches || []).slice(0, 8);
    const matchRows = matches
      .map(
        (m) =>
          `<li><span class="skill-id">${esc(m.skillId)}</span><span class="skill-score">${(Number(m.score) || 0).toFixed(2)} / ${Number(m.hits) || 0} hits</span></li>`,
      )
      .join('');
    const tagRow = tags.length
      ? `<div class="smart-stack-tags">Stack: ${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
      : '';
    host.innerHTML = `
      <div class="smart-budget">
        <div><span class="ct-badge ct-installed">Smart</span><strong>${sel.toLocaleString()} tokens</strong> selected</div>
        <div class="smart-budget-meta">vs <strong>${all.toLocaleString()}</strong> all on${saved > 0 ? `, saving <strong>${saved.toLocaleString()}</strong>` : ''} (${pct}% of full)</div>
      </div>
      ${tagRow}
      <div class="smart-selected"><strong>${selected.length}</strong> skills picked: ${selected.map((id) => `<code>${esc(id)}</code>`).join(' ')}</div>
      ${matchRows ? `<ol class="smart-matches">${matchRows}</ol>` : ''}
    `;
  }

  async function indexSkills() {
    Toast.info('Indexing skill chunks...');
    const result = await DS.indexSkills();
    if (result?.ok) {
      Toast.success(`Indexed ${result.chunks.toLocaleString()} chunks`);
    } else {
      Toast.warn(result?.error || 'Indexing unavailable');
    }
    await loadIndexStatus();
  }

  async function loadBudget() {
    const data = await DS.getContextMd();
    if (!data) return;
    renderBudget(data);
  }

  /** @param {{ budgetPercent?: number, estimatedTokens?: number, contextMdChars?: number, memoryChars?: number, rulesChars?: number }} d */
  function renderBudget(d) {
    const pct = Math.min(d.budgetPercent || 0, 100);
    const tokens = (d.estimatedTokens || 0).toLocaleString();
    const bar = document.getElementById('db-budget-bar');
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
      compileStatus.textContent = `${(d.memoryChars || 0).toLocaleString()} memory chars and ${(d.rulesChars || 0).toLocaleString()} rule chars are in the shared manifest.`;
    }
  }

  async function loadHealth() {
    const data = await DS.getHealth();
    if (!data) return;
    const container = document.getElementById('db-health-list');
    const summary = document.getElementById('db-health-summary');
    if (!container) return;
    /** @typedef {{ id: string, path?: string, issue?: string, stale?: boolean, daysSinceModified?: number }} HealthSkill */
    /** @type {HealthSkill[]} */
    const skills = data.skills || [];
    const issues = skills.filter(/** @param {HealthSkill} s */ (s) => !!s.issue);
    const stale = skills.filter(/** @param {HealthSkill} s */ (s) => !!s.stale && !s.issue);
    const ok = skills.filter(/** @param {HealthSkill} s */ (s) => !s.issue);

    // Compact chip in the keyline head.
    if (summary) {
      if (issues.length || stale.length) {
        const parts = [];
        if (issues.length)
          parts.push(
            `<span class="chip chip-err">${issues.length} issue${issues.length > 1 ? 's' : ''}</span>`,
          );
        if (stale.length) parts.push(`<span class="chip chip-warn">${stale.length} stale</span>`);
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
      ...issues.map(
        /** @param {HealthSkill} s */ (s) => `
        <div class="health-issue" title="${esc(s.path)}">
          <span class="health-id">${esc(s.id)}</span>
          <span class="health-msg">${esc(s.issue)}</span>
        </div>`,
      ),
      ...stale.map(
        /** @param {HealthSkill} s */ (s) => `
        <div class="health-issue stale" title="${esc(s.path)}">
          <span class="health-id">${esc(s.id)}</span>
          <span class="health-msg">Stale (${s.daysSinceModified || '30+'}d since last edit)</span>
        </div>`,
      ),
    ];
    const preview = allRows.slice(0, 3).join('');
    const rest = allRows.slice(3).join('');
    container.innerHTML =
      preview +
      (rest
        ? `<details class="health-more"><summary>Show ${allRows.length - 3} more</summary>${rest}</details>`
        : '');
  }

  async function loadBackups() {
    const data = await DS.getBackups();
    if (!data) return;
    const container = document.getElementById('db-backups-list');
    if (!container) return;
    const backups = data.backups || [];
    if (!backups.length) {
      container.innerHTML = '<div class="db-empty">No backups yet</div>';
      return;
    }
    container.innerHTML = backups
      .map(
        /** @param {{ timestamp: string }} b */ (b) => `
      <div class="backup-item">
        <span class="backup-ts">${b.timestamp.replace('T', ' ')}</span>
        <button class="mem-btn" onclick="DashboardTab.restore('${b.timestamp}')">Restore</button>
      </div>`,
      )
      .join('');
  }

  async function loadSessionLog() {
    const data = await DS.getSessionLog();
    if (!data) return;
    const container = document.getElementById('db-session-log');
    if (!container) return;
    const sessions = data.sessions || [];
    if (!sessions.length) {
      container.innerHTML = '<div class="db-empty">No session history yet</div>';
      return;
    }
    /** @typedef {{ ts: string, type?: string, mode?: string, skills?: unknown[], activeSkills?: number, activeCount?: number, timestamp?: string, targets?: string[], count?: number, workspace?: string }} SessionEntry */
    container.innerHTML = sessions
      .slice(0, 15)
      .map(
        /** @param {SessionEntry} s */ (s) => {
          const ts = new Date(s.ts).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          const sessIcons = /** @type {Record<string, string>} */ (SESS_ICONS);
          const svg = (s.type && sessIcons[s.type]) || sessIcons.manual_regen;
          const label =
            s.type === 'mode_applied'
              ? `Mode applied: ${s.mode} (${(s.skills || []).length} skills)`
              : s.type === 'toggle'
                ? `Skills toggled - ${s.activeSkills} active`
                : s.type === 'backup'
                  ? `Backup created: ${s.timestamp || ''}`
                  : s.type === 'manual_regen'
                    ? `CONTEXT.md regenerated - ${s.activeCount} skills`
                    : s.type === 'global_install'
                      ? `Global install - ${(s.targets || []).join(', ')} (${s.count || 0} skills)`
                      : s.type === 'workspace_compile'
                        ? `Workspace compile - ${s.workspace || 'project'}`
                        : s.type
                          ? s.type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
                          : 'Event';
          return `<div class="session-item" title="${esc(JSON.stringify(s))}"><span class="session-icon">${svg}</span><span class="session-label">${esc(label)}</span><span class="session-ts">${ts}</span></div>`;
        },
      )
      .join('');
  }

  async function backup() {
    Toast.info('Creating backup...');
    const r = await DS.createBackup();
    if (r?.ok) Toast.success('Backup saved');
    else Toast.error('Backup failed');
    await loadBackups();
    await loadSessionLog();
  }

  /** @param {string} ts */
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
      if (typeof ConfigTab !== 'undefined') ConfigTab.init();
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

  /** @param {string} modeId */
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

  async function deployAvailable() {
    if (typeof CompileTab === 'undefined') return;
    await CompileTab.deployAllAvailable();
    await Promise.all([loadSessionLog(), updateExtendedStats(), loadOutputTokens()]);
  }

  /** @param {string} name */
  function openTab(name) {
    switchTabByName(name);
  }

  async function refreshBudget() {
    await loadBudget();
  }

  return {
    init,
    backup,
    restore,
    regenCONTEXTmd,
    discover,
    indexSkills,
    refreshIndexStatus,
    smartCompile,
    refreshBudget,
    loadSessionLog,
    applyMode,
    deployAvailable,
    installGlobals,
    openTab,
    loadOutputTokens,
  };
})();
