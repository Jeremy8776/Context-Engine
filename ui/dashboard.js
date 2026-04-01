// dashboard.js — Dashboard tab v4 (expanded stats, section blocks)

const SESS_ICONS = {
  mode_applied: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 2 2 9 8 9 7 14 14 7 8 7 9 2"/></svg>`,
  backup:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/><polyline points="5 7 8 4 11 7"/><line x1="8" y1="4" x2="8" y2="11"/></svg>`,
  toggle:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 5 4 5 8"/><path d="M5 4a7 7 0 0 1 7 7"/><polyline points="15 12 11 12 11 8"/><path d="M11 12a7 7 0 0 1-7-7"/></svg>`,
  manual_regen: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 5 4 5 8"/><path d="M5 4a7 7 0 0 1 7 7"/><polyline points="15 12 11 12 11 8"/><path d="M11 12a7 7 0 0 1-7-7"/></svg>`,
};
const HEALTH_SVG = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 7 5.5 11 12 3"/></svg>`;

const DashboardTab = (() => {
  async function init() {
    const bar = document.getElementById('db-budget-bar');
    const lbl = document.getElementById('db-budget-label');
    if (bar) bar.style.width = '0%';
    if (lbl) lbl.textContent = 'Loading...';

    await Promise.all([loadBudget(), loadHealth(), loadBackups(), loadSessionLog()]);
    updateStats();
    updateExtendedStats();
  }

  function updateStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter(s => SS.active(s.id)).length;
    const tEl = document.getElementById('db-stat-total');
    const aEl = document.getElementById('db-stat-active');
    if (tEl && typeof animateCount !== 'undefined') animateCount(tEl, total);
    if (aEl && typeof animateCount !== 'undefined') animateCount(aEl, active);
  }

  async function updateExtendedStats() {
    // Connections: count detected tools
    try {
      const toolData = await DS.detectTools();
      const connCount = toolData ? Object.values(toolData).filter(t => t.installed).length : 0;
      const connEl = document.getElementById('db-stat-connections');
      if (connEl && typeof animateCount !== 'undefined') animateCount(connEl, connCount);
    } catch {}

    // Modes count
    try {
      const modesData = await DS.getModes();
      const modesCount = modesData?.modes?.length || 0;
      const modesEl = document.getElementById('db-stat-modes');
      if (modesEl && typeof animateCount !== 'undefined') animateCount(modesEl, modesCount);
    } catch {}

    // Rules tokens (rough: chars / 4)
    const rules = RS.get();
    const rulesText = [rules.coding || '', rules.general || '', rules.soul || ''].join(' ');
    const rulesTokens = Math.ceil(rulesText.length / 4);
    const rtEl = document.getElementById('db-stat-rules-tokens');
    if (rtEl && typeof animateCount !== 'undefined') animateCount(rtEl, rulesTokens);

    // Memory tokens
    const mem = MS.getData();
    const memText = (mem.entries || []).map(e => typeof e === 'string' ? e : e.content || '').join(' ');
    const memTokens = Math.ceil(memText.length / 4);
    const mtEl = document.getElementById('db-stat-memory-tokens');
    if (mtEl && typeof animateCount !== 'undefined') animateCount(mtEl, memTokens);
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
    renderContextMdPreview(data.content || '');
  }

  function renderBudget(d) {
    const pct   = Math.min(d.budgetPercent || 0, 100);
    const tokens = (d.estimatedTokens || 0).toLocaleString();
    const bar   = document.getElementById('db-budget-bar');
    const label = document.getElementById('db-budget-label');
    const detail= document.getElementById('db-budget-detail');
    const statB = document.getElementById('db-stat-budget');

    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'budget-fill' + (pct > 90 ? ' danger' : pct > 70 ? ' warn' : '');
    }
    if (label) label.textContent = `~${tokens} tokens (${pct}% of 200k context)`;
    if (statB) statB.textContent = pct + '%';
    if (detail) detail.innerHTML =
      `<span>MANIFEST: ${(d.contextMdChars||0).toLocaleString()} chars</span>` +
      `<span>MEMORY: ${(d.memoryChars||0).toLocaleString()} chars</span>` +
      `<span>RULES: ${(d.rulesChars||0).toLocaleString()} chars</span>`;
  }

  function renderContextMdPreview(content) {
    const el = document.getElementById('db-context-preview');
    if (el) el.textContent = content || '(empty)';
  }

  async function loadHealth() {
    const data = await DS.getHealth();
    if (!data) return;
    const container = document.getElementById('db-health-list');
    if (!container) return;
    const skills = data.skills || [];
    const issues = skills.filter(s => s.issue);
    const ok     = skills.filter(s => !s.issue);
    if (!issues.length) {
      container.innerHTML = `<div class="health-ok"><span class="health-check">${HEALTH_SVG}</span>All ${ok.length} skill files verified</div>`;
      return;
    }
    const stale = skills.filter(s => s.stale && !s.issue);
    container.innerHTML = issues.map(s => `
      <div class="health-issue">
        <span class="health-id">${esc(s.id)}</span>
        <span class="health-msg">${esc(s.issue)}</span>
        <span class="health-path">${esc(s.path)}</span>
      </div>`).join('') +
      (stale.length ? stale.map(s => `
      <div class="health-issue stale">
        <span class="health-id" style="color:var(--amber)">${esc(s.id)}</span>
        <span class="health-msg" style="color:var(--amber)">Stale (${s.daysSinceModified || '30+'}d since last edit)</span>
        <span class="health-path">${esc(s.path)}</span>
      </div>`).join('') : '') +
      `<div class="health-ok" style="margin-top:8px"><span class="health-check">${HEALTH_SVG}</span>${ok.length} files OK / ${issues.length} issue${issues.length>1?'s':''}${stale.length ? ` / ${stale.length} stale` : ''}</div>`;
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
        s.type === 'mode_applied'  ? `Mode applied: ${s.mode} (${(s.skills||[]).length} skills)` :
        s.type === 'toggle'        ? `Skills toggled — ${s.activeSkills} active` :
        s.type === 'backup'        ? `Backup created: ${s.timestamp||''}` :
        s.type === 'manual_regen'  ? `CONTEXT.md regenerated — ${s.activeCount} skills` :
        JSON.stringify(s);
      return `<div class="session-item"><span class="session-icon">${svg}</span><span class="session-label">${esc(label)}</span><span class="session-ts">${ts}</span></div>`;
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
    if (!confirm(`Restore backup from ${ts}?\n\nThis will overwrite current memory, rules, and CONTEXT.md.`)) return;
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

  async function refreshBudget() { await loadBudget(); }

  return { init, backup, restore, regenCONTEXTmd, discover, refreshBudget, loadSessionLog };
})();
