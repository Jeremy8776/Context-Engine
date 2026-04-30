// modes.js — Mode presets tab v4 (editable, side panel, create/delete)

const MODE_ICONS = {
  target:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.19 0 2-.9 2-2 0-.53-.19-1.01-.48-1.38-.29-.37-.47-.84-.47-1.37 0-1.1.9-2 2-2h2c2.76 0 5-2.24 5-5 0-5.52-4.48-9-9-9z"/><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor"/><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor"/></svg>',
  bolt:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  focus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"/></svg>',
  image:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  unlock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
};

const ModesTab = (() => {
  let modes = [];
  let activeMode = localStorage.getItem('cm_active_mode') || null;
  let selectedModeId = null;
  let sidePanelCloseBound = false;
  let createShortcutBound = false;

  async function init() {
    const data = await DS.getModes();
    if (data && data.modes) { modes = data.modes; render(); }
    if (!sidePanelCloseBound) {
      document.addEventListener('sidepanel:close', () => {
        if (!selectedModeId) return;
        selectedModeId = null;
        render();
      });
      sidePanelCloseBound = true;
    }
    bindCreateShortcut();
    requestAnimationFrame(syncCreateShortcut);
  }

  function bindCreateShortcut() {
    if (createShortcutBound) return;
    const tab = document.getElementById('modes-tab');
    tab?.addEventListener('scroll', syncCreateShortcut, { passive: true });
    window.addEventListener('resize', syncCreateShortcut);
    createShortcutBound = true;
  }

  function addCardIsVisible() {
    const card = document.querySelector('#modes-list .mode-card-ghost');
    const tab = document.getElementById('modes-tab');
    if (!card || !tab?.classList.contains('active')) return false;
    const cardRect = card.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    return cardRect.top < tabRect.bottom && cardRect.bottom > tabRect.top;
  }

  function syncCreateShortcut() {
    const btn = document.getElementById('modes-create-shortcut');
    const tab = document.getElementById('modes-tab');
    if (!btn || !tab) return;
    btn.hidden = !tab.classList.contains('active') || addCardIsVisible();
  }

  function render() {
    const container = document.getElementById('modes-list');
    if (!container) return;
    const createCard = `
      <button class="mode-card mode-card-ghost" type="button" onclick="ModesTab.createNew()">
        <span class="mode-add-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
        </span>
        <span class="mode-add-title">New mode</span>
        <span class="mode-add-copy">Create preset</span>
      </button>`;
    const modeCards = modes.map(m => {
      const svg = MODE_ICONS[m.icon] || MODE_ICONS['bolt'];
      const skills = m.skills || [];
      const preview = skills.slice(0, 8).map(sid => `<span>${esc(sid)}</span>`).join('');
      const overflow = skills.length > 8 ? `<span>+${skills.length - 8}</span>` : '';
      const stateClasses = [
        activeMode === m.id ? 'mode-active' : '',
        selectedModeId === m.id ? 'selected' : '',
      ].filter(Boolean).join(' ');
      return `
      <button class="mode-card ${stateClasses}" onclick="ModesTab.openDetail('${m.id}')">
        <span class="mode-card-main">
          <span class="mode-row-icon">${svg}</span>
          <span class="mode-card-copy">
            <span class="mode-row-name">${esc(m.label)}</span>
            <span class="mode-row-desc">${esc(m.desc || 'No description')}</span>
          </span>
        </span>
        <span class="mode-card-preview">${preview}${overflow}</span>
        <span class="mode-card-meta">
          <span class="mode-row-meta">${skills.length} skills</span>
          <span class="mode-row-meta">${activeMode === m.id ? 'active' : 'preset'}</span>
        </span>
      </button>`;
    }).join('');
    container.innerHTML = modeCards + createCard;
    bindCreateShortcut();
    requestAnimationFrame(syncCreateShortcut);
  }

  function renderSkillChain(mode) {
    if (!mode.skills || !mode.skills.length) return '<div class="db-empty">No skills in this preset.</div>';
    return mode.skills.map(sid => {
      const skill = SKILL_DATA.find(s => s.id === sid);
      const active = SS.active(sid);
      return `<div class="sp-skill-item">
        <span class="dot ${active ? 'on' : 'off'}"></span>
        <span>${esc(sid)}</span>
        ${skill ? `<span style="color:var(--text-subtle);font-size:11px;margin-left:auto">${esc(skill.desc.slice(0,56))}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderMcp(mode) {
    if (!(mode.mcpServers || []).length) return '';
    return `<div class="sp-section">
      <h4>MCP Servers</h4>
      ${mode.mcpServers.map(s => `<div class="sp-mcp-item"><span>${esc(s.name)}</span><span style="color:var(--text-subtle)">${esc(s.url || '')}</span></div>`).join('')}
    </div>`;
  }

  function renderModeSummary(mode) {
    const skills = mode.skills || [];
    const activeCount = skills.filter(sid => SS.active(sid)).length;
    return `
      <div class="mode-detail-summary">
        <div>
          <strong>${skills.length}</strong>
          <span>Skills</span>
        </div>
        <div>
          <strong>${activeCount}</strong>
          <span>Currently active</span>
        </div>
        <div>
          <strong>${(mode.mcpServers || []).length}</strong>
          <span>MCP servers</span>
        </div>
      </div>`;
  }

  // ---- SIDE PANEL: VIEW DETAIL ----
  function openDetail(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    if (selectedModeId === mode.id && SidePanel.isOpen()) {
      selectedModeId = null;
      SidePanel.close();
      render();
      return;
    }
    selectedModeId = mode.id;
    render();
    const html = `
      <div class="sp-detail mode-detail">
        <div class="detail-panel-intro">
          <div class="detail-panel-meta">
            <span>Preset</span>
            <span>${activeMode === mode.id ? 'Active' : 'Available'}</span>
          </div>
          <p>${esc(mode.desc || 'No description')}</p>
        </div>
        ${renderModeSummary(mode)}
        <div class="detail-section"><h4>Skills</h4><div class="sp-skill-list mode-skill-chain">${renderSkillChain(mode)}</div></div>
        ${renderMcp(mode)}
        <div class="sp-actions mode-detail-actions">
          <button class="save-btn" onclick="ModesTab.apply('${mode.id}'); SidePanel.close();">Apply Mode</button>
          <button class="save-btn ghost" onclick="ModesTab.editMode('${mode.id}')">Edit</button>
        </div>
      </div>`;
    SidePanel.open(mode.label, html);
  }

  // ---- SIDE PANEL: EDIT ----
  function editMode(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    selectedModeId = mode.id;
    render();

    const allSkills = SKILL_DATA.map(s => {
      const inMode = mode.skills.includes(s.id);
      return `<label class="sp-skill-toggle">
        <input type="checkbox" class="styled-check" ${inMode ? 'checked' : ''} data-skill-id="${s.id}">
        <span>${esc(s.id)}</span>
      </label>`;
    }).join('');

    const iconOptions = Object.keys(MODE_ICONS).map(k =>
      `<button class="mem-btn ${mode.icon === k ? 'save' : ''}" onclick="document.getElementById('sp-mode-icon').value='${k}'; this.parentElement.querySelectorAll('.mem-btn').forEach(b=>b.classList.remove('save')); this.classList.add('save');">${k}</button>`
    ).join(' ');

    const html = `
      <div class="sp-detail">
        <div class="sp-field">
          <label>Name</label>
          <input class="add-input" id="sp-mode-name" value="${esc(mode.label)}">
        </div>
        <div class="sp-field">
          <label>Description</label>
          <textarea class="rules-textarea" id="sp-mode-desc" rows="3">${esc(mode.desc)}</textarea>
        </div>
        <div class="sp-field">
          <label>Icon</label>
          <input type="hidden" id="sp-mode-icon" value="${mode.icon || 'bolt'}">
          <div style="display:flex;gap:6px;flex-wrap:wrap">${iconOptions}</div>
        </div>
        <div class="sp-section">
          <h4>Skills</h4>
          <div class="sp-skill-list">${allSkills}</div>
        </div>
        <div class="sp-actions" style="margin-top:24px">
          <button class="save-btn" onclick="ModesTab.saveEdit('${mode.id}')">Save</button>
          <button class="save-btn ghost" onclick="SidePanel.close()">Cancel</button>
          <button class="mem-btn danger" onclick="ModesTab.deleteMode('${mode.id}')" style="margin-left:auto">Delete</button>
        </div>
      </div>`;
    SidePanel.open(`Edit: ${mode.label}`, html);
  }

  // ---- SAVE / DELETE / CREATE ----
  async function saveEdit(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    mode.label = (document.getElementById('sp-mode-name')?.value || '').trim() || mode.label;
    mode.desc  = (document.getElementById('sp-mode-desc')?.value || '').trim();
    mode.icon  = (document.getElementById('sp-mode-icon')?.value || 'bolt');
    mode.skills = [...document.querySelectorAll('.sp-skill-list input:checked')].map(el => el.dataset.skillId);
    await saveModes();
    render();
    SidePanel.close();
    Toast.success('Mode saved');
  }

  async function deleteMode(modeId) {
    const ok = await AppDialog.confirm({
      title: 'Delete mode',
      message: 'This removes the preset from your saved modes.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    modes = modes.filter(m => m.id !== modeId);
    await saveModes();
    render();
    SidePanel.close();
    Toast.success('Mode deleted');
  }

  function openCreateModal() {
    const overlay = document.getElementById('mode-modal-overlay');
    const name = document.getElementById('mode-modal-name');
    const desc = document.getElementById('mode-modal-desc');
    const icon = document.getElementById('mode-modal-icon');
    const seed = document.getElementById('mode-modal-seed');
    const search = document.getElementById('mode-modal-skill-search');
    if (!overlay || !name || !desc || !icon || !seed) return;
    name.value = '';
    desc.value = '';
    icon.value = 'bolt';
    seed.value = 'active';
    if (search) search.value = '';
    renderCreateSkills('active');
    overlay.classList.add('open');
    setTimeout(() => name.focus(), 0);
  }

  function closeCreateModal(event) {
    if (event && event.target.id !== 'mode-modal-overlay') return;
    document.getElementById('mode-modal-overlay')?.classList.remove('open');
  }

  function seededSkills(seed) {
    if (seed === 'all') return SKILL_DATA.map(s => s.id);
    if (seed === 'active') return SKILL_DATA.filter(s => SS.active(s.id)).map(s => s.id);
    return [];
  }

  function renderCreateSkills(seed = document.getElementById('mode-modal-seed')?.value || 'active') {
    const host = document.getElementById('mode-modal-skills');
    const seedSelect = document.getElementById('mode-modal-seed');
    const search = document.getElementById('mode-modal-skill-search');
    if (!host) return;
    if (seedSelect) seedSelect.value = seed;
    if (search) search.value = '';
    const selected = new Set(seededSkills(seed));
    host.innerHTML = SKILL_DATA.map(skill => {
      const checked = selected.has(skill.id);
      const skillId = esc(skill.id);
      return `<label class="mode-skill-choice">
        <input type="checkbox" class="styled-check" data-skill-id="${skillId}" ${checked ? 'checked' : ''} onchange="ModesTab.updateCreateSkillCount()">
        <span>
          <strong>${esc(skill.name || skill.id)}</strong>
          <small>${esc(skill.desc || skill.id)}</small>
        </span>
      </label>`;
    }).join('');
    filterCreateSkills('');
  }

  function selectedCreateSkills() {
    const host = document.getElementById('mode-modal-skills');
    if (host?.children.length) {
      return [...host.querySelectorAll('input:checked')].map(el => el.dataset.skillId);
    }
    return seededSkills(document.getElementById('mode-modal-seed')?.value || 'active');
  }

  function filterCreateSkills(query = document.getElementById('mode-modal-skill-search')?.value || '') {
    const host = document.getElementById('mode-modal-skills');
    if (!host) return;
    const q = query.trim().toLowerCase();
    host.querySelectorAll('.mode-skill-choice').forEach(choice => {
      const matches = !q || choice.textContent.toLowerCase().includes(q);
      choice.hidden = !matches;
    });
    updateCreateSkillCount();
  }

  function updateCreateSkillCount() {
    const count = document.getElementById('mode-modal-skill-count');
    if (!count) return;
    const host = document.getElementById('mode-modal-skills');
    const selected = host?.querySelectorAll('input:checked').length || 0;
    const search = document.getElementById('mode-modal-skill-search');
    const filtered = Boolean(search?.value.trim());
    const shown = filtered ? host?.querySelectorAll('.mode-skill-choice:not([hidden])').length || 0 : null;
    count.textContent = filtered ? `${selected} selected / ${shown} shown` : `${selected} selected`;
  }

  async function createFromModal() {
    const name = (document.getElementById('mode-modal-name')?.value || '').trim();
    const desc = (document.getElementById('mode-modal-desc')?.value || '').trim();
    const icon = document.getElementById('mode-modal-icon')?.value || 'bolt';
    if (!name) { Toast.error('Mode name required'); return; }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) { Toast.error('Mode name needs letters or numbers'); return; }
    if (modes.find(m => m.id === id)) { Toast.error('Mode with this ID already exists'); return; }
    const newMode = {
      id,
      label: name,
      icon,
      color: '#8b5cf6',
      desc,
      skills: selectedCreateSkills(),
    };
    modes.push(newMode);
    await saveModes();
    render();
    closeCreateModal();
    openDetail(id);
    Toast.success('Mode created');
  }

  async function createNew() {
    openCreateModal();
  }

  async function saveModes() {
    await apiFetch('/modes', 'POST', { modes });
  }

  // ---- APPLY ----
  async function apply(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    const skills = mode.skills || [];
    const ok = await AppDialog.confirm({
      title: `Apply ${mode.label}`,
      message: `This will turn on ${skills.length} skills for this preset and disable the rest. You can adjust manually afterwards.`,
      confirmText: 'Apply mode',
    });
    if (!ok) return;

    const r = await DS.applyMode(modeId);
    if (r?.ok) {
      activeMode = modeId;
      localStorage.setItem('cm_active_mode', modeId);
      if (r.states) SS.applyServerStates(r.states.states || r.states);
      render();
      if (typeof SkillsTab !== 'undefined') SkillsTab.init();
      if (typeof DashboardTab !== 'undefined') { DashboardTab.refreshBudget(); DashboardTab.loadSessionLog(); }
      Toast.success(`Mode "${mode.label}" applied`);
    } else {
      Toast.error('Failed to apply mode');
    }
  }

  return {
    init,
    apply,
    openDetail,
    editMode,
    saveEdit,
    deleteMode,
    createNew,
    openCreateModal,
    closeCreateModal,
    createFromModal,
    syncCreateShortcut,
    renderCreateSkills,
    filterCreateSkills,
    updateCreateSkillCount,
  };
})();
