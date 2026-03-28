// skills.js — skills tab v3

const SkillsTab = (() => {
  let filter = 'all';
  let view = 'grid';
  let selectedSkill = null;
  let panelOpen = false;
  let activeCat = null;

  const bc = t => t === 'custom' ? 'badge-custom' : t === 'builtin' ? 'badge-builtin' : 'badge-external';
  const bl = t => t === 'custom' ? 'custom' : t === 'builtin' ? 'built-in' : 'external';

  function statusExplain(type, isActive) {
    const location = {
      custom:   'File lives at skills/ — always on disk.',
      builtin:  'Platform-integrated skill — provided by the agent runtime.',
      external: 'External skill — requires additional setup to use.',
    }[type] || '';
    const effect = isActive
      ? 'Active — the agent reads this SKILL.md before handling matching tasks.'
      : 'Inactive — the agent skips this skill. File untouched. Toggle to re-enable.';
    return { location, effect };
  }

  function renderStats() {
    document.getElementById('stat-total').textContent   = SKILL_DATA.length;
    document.getElementById('stat-active').textContent  = SKILL_DATA.filter(s => SS.active(s.id)).length;
    document.getElementById('stat-custom').textContent  = SKILL_DATA.filter(s => s.type === 'custom').length;
    document.getElementById('stat-builtin').textContent = SKILL_DATA.filter(s => s.type === 'builtin').length;
  }

  function renderSidebar() {
    const nav = document.getElementById('cat-nav');
    nav.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const count  = SKILL_DATA.filter(s => s.cat === cat.id).length;
      const active = SKILL_DATA.filter(s => s.cat === cat.id && SS.active(s.id)).length;
      const item = document.createElement('div');
      item.className = 'cat-nav-item' + (activeCat === cat.id ? ' active' : '');
      const label = cat.label.replace(/^\d+\s-\s/, '');
      item.innerHTML = `<span class="cat-nav-num">${cat.id}</span><span>${label}</span><span class="cat-nav-count">${active}/${count}</span>`;
      item.addEventListener('click', () => scrollToCat(cat.id));
      nav.appendChild(item);
    });
  }

  function scrollToCat(catId) {
    activeCat = catId;
    renderSidebar();
    const el = document.getElementById('cat-' + catId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setFilter(f, btn) {
    filter = f;
    document.querySelectorAll('#skills-tab .fb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    render();
  }

  function setView(v) {
    view = v;
    document.getElementById('btn-grid').classList.toggle('on', v === 'grid');
    document.getElementById('btn-list').classList.toggle('on', v === 'list');
    render();
  }

  function openPanel(skill) {
    selectedSkill = skill;
    panelOpen = true;
    document.getElementById('side-panel').classList.add('open');
    document.getElementById('skills-main').classList.add('shifted');
    renderPanel();
    render();
  }

  function closePanel() {
    selectedSkill = null;
    panelOpen = false;
    document.getElementById('side-panel').classList.remove('open');
    document.getElementById('skills-main').classList.remove('shifted');
    render();
  }

  function handleToggle(skillId, active, e) {
    e.stopPropagation();
    SS.set(skillId, active);
    renderStats();
    renderSidebar();
    render();
    if (selectedSkill && selectedSkill.id === skillId) renderPanel();
  }

  function makeToggle(skill, isActive) {
    return `<label class="toggle" title="${isActive ? 'Deactivate' : 'Activate'}">
      <input type="checkbox" ${isActive ? 'checked' : ''} onchange="SkillsTab.handleToggle('${skill.id}',this.checked,event)">
      <div class="toggle-track"></div>
    </label>`;
  }

  function makeCard(skill, catIdx, i) {
    const isActive = SS.active(skill.id);
    const isSel = selectedSkill && selectedSkill.id === skill.id;
    const card = document.createElement('div');
    card.className = `card${isSel ? ' sel' : ''}${!isActive ? ' inactive' : ''}`;
    card.style.animationDelay = `${catIdx * 35 + i * 15}ms`;

    if (view === 'list') {
      card.innerHTML = `
        <div class="card-body">
          <div class="card-top">
            <span class="card-name">${skill.id}</span>
            <span class="badge ${bc(skill.type)}">${bl(skill.type)}</span>
          </div>
          <div class="card-desc">${skill.desc}</div>
        </div>
        <div class="card-footer">${makeToggle(skill, isActive)}</div>`;
    } else {
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${skill.id}</span>
          <span class="badge ${bc(skill.type)}">${bl(skill.type)}</span>
        </div>
        <div class="card-desc">${skill.desc}</div>
        <div class="card-footer">
          <div class="dot ${isActive ? 'on' : 'off'}"></div>
          ${makeToggle(skill, isActive)}
        </div>`;
    }

    card.addEventListener('click', e => {
      if (e.target.closest('.toggle')) return;
      if (selectedSkill && selectedSkill.id === skill.id) closePanel();
      else openPanel(skill);
    });
    return card;
  }

  function render() {
    const q = (document.getElementById('skills-search').value || '').toLowerCase();
    const list = document.getElementById('skills-list');
    list.innerHTML = '';
    list.classList.toggle('list-view', view === 'list');

    CATEGORIES.forEach((cat, catIdx) => {
      const visible = SKILL_DATA.filter(s => {
        if (s.cat !== cat.id) return false;
        const act = SS.active(s.id);
        if (filter === 'active'   && !act) return false;
        if (filter === 'inactive' &&  act) return false;
        if (filter === 'custom'   && s.type !== 'custom')  return false;
        if (filter === 'builtin'  && s.type !== 'builtin') return false;
        if (q && !s.id.includes(q) && !s.desc.toLowerCase().includes(q) &&
            !s.triggers.some(t => t.toLowerCase().includes(q))) return false;
        return true;
      });
      if (!visible.length) return;

      const sec = document.createElement('div');
      sec.className = 'cat';
      sec.id = 'cat-' + cat.id;
      sec.style.animationDelay = `${catIdx * 35}ms`;
      sec.innerHTML = `<div class="cat-lbl">${cat.label}<span class="cat-lbl-count">${visible.length}</span></div>
                       <div class="grid" id="grid-${cat.id}"></div>`;
      list.appendChild(sec);
      const grid = sec.querySelector('.grid');
      visible.forEach((skill, i) => grid.appendChild(makeCard(skill, catIdx, i)));
    });

    if (!list.children.length) list.innerHTML = '<div class="no-results">No skills match</div>';
  }

  function renderPanel() {
    const panel = document.getElementById('side-panel');
    if (!selectedSkill || !panelOpen) {
      panel.innerHTML = `<div class="panel-empty">
        <div class="panel-empty-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/>
        <line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
        <div class="panel-empty-msg">Select a skill<br>to inspect it</div></div>`;
      return;
    }
    const s = selectedSkill;
    const isActive = SS.active(s.id);
    const { location, effect } = statusExplain(s.type, isActive);
    panel.innerHTML = `
      <div class="panel-content">
        <div class="panel-close-row"><button class="close-btn" onclick="SkillsTab.closePanel()">&#xd7;</button></div>
        <div class="panel-status-block">
          <div class="panel-status-row">
            <span class="panel-toggle-label">${isActive ? 'Active' : 'Inactive'}</span>
            <label class="toggle">
              <input type="checkbox" ${isActive ? 'checked' : ''} onchange="SkillsTab.handleToggle('${s.id}',this.checked,event)">
              <div class="toggle-track"></div>
            </label>
          </div>
          <div class="panel-status-explain">
            <span class="${isActive ? 'status-on' : 'status-off'}">${effect}</span><br>
            <span class="status-location">${location}</span>
          </div>
        </div>
        <div class="panel-badge-row"><span class="badge ${bc(s.type)}">${bl(s.type)}</span></div>
        <div class="panel-name">${s.id}</div>
        <div class="panel-desc">${s.desc}</div>
        <div class="panel-divider"></div>
        <div class="panel-lbl">Trigger phrases</div>
        <div class="trigger-list">${s.triggers.map(t => `<div class="trigger">${t}</div>`).join('')}</div>
        <div class="panel-divider"></div>
        <div class="panel-lbl">File path</div>
        <div class="path-box">${s.path}</div>
      </div>`;
  }

  function initScrollSpy() {
    const scroll = document.getElementById('skills-main');
    if (!scroll) return;
    scroll.addEventListener('scroll', () => {
      const cats = document.querySelectorAll('.cat[id^="cat-"]');
      let current = null;
      cats.forEach(el => { if (el.offsetTop - scroll.scrollTop <= 60) current = el.id.replace('cat-', ''); });
      if (current && current !== activeCat) { activeCat = current; renderSidebar(); }
    }, { passive: true });
  }

  function init() {
    renderStats();
    renderSidebar();
    render();
    document.getElementById('skills-search').addEventListener('input', render);
    initScrollSpy();
  }

  return { init, render, renderPanel, closePanel, setFilter, setView, handleToggle };
})();
