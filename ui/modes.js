// modes.js — Mode presets tab

// SVG icon map — all paths, no emojis
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
      <div class="mode-card ${activeMode === m.id ? 'mode-active' : ''}" style="--mode-color:${m.color}" onclick="ModesTab.apply('${m.id}')">
        <div class="mode-header">
          <span class="mode-icon">${svg}</span>
          <span class="mode-label">${m.label}</span>
          ${activeMode === m.id ? '<span class="mode-badge">Active</span>' : ''}
        </div>
        <div class="mode-desc">${m.desc}</div>
        <div class="mode-skills">
          ${m.skills.map(s => `<span class="mode-skill-tag">${s}</span>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

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
    } else {
      alert('Failed to apply mode.');
    }
  }

  return { init, apply };
})();
