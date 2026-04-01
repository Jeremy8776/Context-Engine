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

  async function init() {
    const data = await DS.getModes();
    if (data && data.modes) { modes = data.modes; render(); }
  }

  function render() {
    const container = document.getElementById('modes-list');
    if (!container) return;
    container.innerHTML = modes.map(m => {
      const svg = MODE_ICONS[m.icon] || MODE_ICONS['bolt'];
      return `
      <div class="mode-row ${activeMode === m.id ? 'mode-active' : ''}" onclick="ModesTab.openDetail('${m.id}')">
        <div class="mode-row-top">
          <span class="mode-row-icon">${svg}</span>
          <div class="mode-row-name">${esc(m.label)}</div>
        </div>
        <div class="mode-row-desc">${esc(m.desc)}</div>
        <div class="mode-row-bottom">
          <span class="mode-row-meta">${m.skills.length} skills</span>
          <div class="mode-row-actions" onclick="event.stopPropagation()">
            <button class="mem-btn save" onclick="ModesTab.apply('${m.id}')">Apply</button>
            <button class="mem-btn" onclick="ModesTab.editMode('${m.id}')">Edit</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ---- SIDE PANEL: VIEW DETAIL ----
  function openDetail(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    const skillList = mode.skills.map(sid => {
      const skill = SKILL_DATA.find(s => s.id === sid);
      const active = SS.active(sid);
      return `<div class="sp-skill-item">
        <span class="dot ${active ? 'on' : 'off'}"></span>
        <span>${esc(sid)}</span>
        ${skill ? `<span style="color:var(--t3);font-size:11px;margin-left:auto">${esc(skill.desc.slice(0,40))}</span>` : ''}
      </div>`;
    }).join('');

    const mcpHtml = (mode.mcpServers || []).length
      ? `<div class="sp-section"><h4>MCP Servers</h4>${mode.mcpServers.map(s => `<div class="sp-mcp-item"><span>${esc(s.name)}</span><span style="color:var(--t3)">${esc(s.url || '')}</span></div>`).join('')}</div>`
      : '';

    const html = `
      <div class="sp-detail">
        <div class="sp-field"><label>Description</label><p>${esc(mode.desc)}</p></div>
        <div class="sp-section"><h4>Skills (${mode.skills.length})</h4>${skillList || '<span style="color:var(--t3)">No skills</span>'}</div>
        ${mcpHtml}
        <div class="sp-actions" style="margin-top:24px">
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
    if (!confirm('Delete this mode?')) return;
    modes = modes.filter(m => m.id !== modeId);
    await saveModes();
    render();
    SidePanel.close();
    Toast.success('Mode deleted');
  }

  async function createNew() {
    const name = prompt('New mode name:');
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (modes.find(m => m.id === id)) { Toast.error('Mode with this ID already exists'); return; }
    const newMode = {
      id,
      label: name.trim(),
      icon: 'bolt',
      color: '#8b5cf6',
      desc: '',
      skills: [],
    };
    modes.push(newMode);
    await saveModes();
    render();
    editMode(id);
  }

  async function saveModes() {
    await apiFetch('/modes', 'POST', { modes });
  }

  // ---- APPLY ----
  async function apply(modeId) {
    const mode = modes.find(m => m.id === modeId);
    if (!mode) return;
    if (!confirm(`Apply "${mode.label}" mode?\n\nThis will toggle ${mode.skills.length} skills on and disable all others.\nYou can manually adjust afterwards.`)) return;

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

  return { init, apply, openDetail, editMode, saveEdit, deleteMode, createNew };
})();
