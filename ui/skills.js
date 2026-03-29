// skills.js — skills tab v3 (simplified flat list + bulk toggle)
const SkillsTab = (() => {
  let filter = 'all';
  let view = 'grid';
  let selected = new Set();

  const bc = t => t === 'custom' ? 'badge-custom' : t === 'builtin' ? 'badge-builtin' : 'badge-external';
  const bl = t => t === 'custom' ? 'custom' : t === 'builtin' ? 'built-in' : 'external';

  function renderStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter(s => SS.active(s.id)).length;
    const custom = SKILL_DATA.filter(s => s.type === 'custom').length;
    const builtin = SKILL_DATA.filter(s => s.type === 'builtin').length;
    
    document.getElementById('stat-total') && (document.getElementById('stat-total').textContent = total);
    document.getElementById('stat-active') && (document.getElementById('stat-active').textContent = active);
    document.getElementById('stat-custom') && (document.getElementById('stat-custom').textContent = custom);
    document.getElementById('stat-builtin') && (document.getElementById('stat-builtin').textContent = builtin);
  }

  function toggleSelect(id, e) {
    if (e) e.stopPropagation();
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderBulkBar();
    render();
  }

  function selectAll() {
    const q = (document.getElementById('skills-search').value || '').toLowerCase();
    SKILL_DATA.filter(s => {
      if (filter === 'active' && !SS.active(s.id)) return false;
      if (filter === 'inactive' && SS.active(s.id)) return false;
      if (q && !s.id.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q)) return false;
      return true;
    }).forEach(s => selected.add(s.id));
    renderBulkBar();
    render();
  }

  function selectNone() {
    selected.clear();
    renderBulkBar();
    render();
  }

  function bulkEnable() {
    if (!selected.size) return;
    SS.setBulk([...selected], true);
    selected.clear();
    renderBulkBar(); renderStats(); render();
  }

  function bulkDisable() {
    if (!selected.size) return;
    SS.setBulk([...selected], false);
    selected.clear();
    renderBulkBar(); renderStats(); render();
  }

  function renderBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    if (!selected.size) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.querySelector('.bulk-count').textContent = `${selected.size} selected`;
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

  function handleToggle(skillId, active, e) {
    if (e) e.stopPropagation();
    SS.set(skillId, active);
    renderStats();
    render();
  }

  function makeToggle(skill, isActive) {
    return `<label class="toggle" title="${isActive ? 'Deactivate' : 'Activate'}">
      <input type="checkbox" ${isActive ? 'checked' : ''} onchange="SkillsTab.handleToggle('${skill.id}',this.checked,event)">
      <div class="toggle-track"></div>
    </label>`;
  }

  function makeCard(skill, i) {
    const isActive = SS.active(skill.id);
    const isSel = selected.has(skill.id);
    const card = document.createElement('div');
    card.className = `card${!isActive ? ' inactive' : ''}${isSel ? ' sel' : ''}`;
    card.style.animationDelay = `${i * 15}ms`;

    card.innerHTML = `
      <div class="card-status-block">
        <div class="card-select-wrap" onclick="event.stopPropagation()">
          <input type="checkbox" class="card-sel-check" ${isSel ? 'checked' : ''} onchange="SkillsTab.toggleSelect('${skill.id}',event)">
        </div>
        <div class="card-toggle-wrap" onclick="event.stopPropagation()">
          ${makeToggle(skill, isActive)}
        </div>
        <span class="card-toggle-lbl">${isActive ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="card-body">
        <span class="card-name">${skill.id}</span>
        <div class="card-desc">${skill.desc}</div>
        <div class="card-tags">
          <span class="badge ${bc(skill.type)}">${bl(skill.type)}</span>
        </div>
      </div>`;

    card.addEventListener('click', e => handleToggle(skill.id, !SS.active(skill.id), e));
    return card;
  }

  function render() {
    const q = (document.getElementById('skills-search').value || '').toLowerCase();
    const list = document.getElementById('skills-list');
    list.innerHTML = '';
    list.classList.toggle('list-view', view === 'list');

    const visible = SKILL_DATA.filter(s => {
      const act = SS.active(s.id);
      if (filter === 'active'   && !act) return false;
      if (filter === 'inactive' &&  act) return false;
      if (filter === 'custom'   && s.type !== 'custom')  return false;
      if (filter === 'builtin'  && s.type !== 'builtin') return false;
      if (q && !s.id.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q)) return false;
      return true;
    });

    if (!visible.length) {
      list.innerHTML = '<div class="no-results">No skills match</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    visible.forEach((skill, i) => grid.appendChild(makeCard(skill, i)));
    list.appendChild(grid);
  }

  function init() {
    renderStats();
    render();
    document.getElementById('skills-search').addEventListener('input', render);
  }

  async function ingest() {
    const input   = document.getElementById('ingest-url');
    const btn     = document.getElementById('btn-ingest');
    const url     = input.value.trim();

    if (!url) { input.focus(); return; }
    if (!url.startsWith('http')) { Toast.error('Must be a full https://... URL'); return; }

    let progressEl = document.getElementById('ingest-progress');
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.id = 'ingest-progress';
      progressEl.className = 'ingest-progress';
      document.querySelector('.skills-ingest-suggest').after(progressEl);
    }
    progressEl.innerHTML = '<div class="ingest-log"></div>';
    const logEl = progressEl.querySelector('.ingest-log');

    const pushLog = (msg, cls = '') => {
      const line = document.createElement('div');
      line.className = 'ingest-log-line' + (cls ? ` ${cls}` : '');
      line.textContent = msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    };

    btn.textContent = '...';
    btn.disabled = true;
    input.disabled = true;
    pushLog('Sending request to server...');

    const startRes = await DS.ingestRepo(url);
    if (!startRes?.ok || !startRes.jobId) {
      pushLog(startRes?.error || 'Failed to start ingest job.', 'log-error');
      btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 8h6M8 5v6"/><circle cx="8" cy="8" r="7"/></svg>'; btn.disabled = false; input.disabled = false;
      return;
    }

    const { jobId } = startRes;
    let lastLogLen = 0;
    const poll = setInterval(async () => {
      const status = await DS.pollIngestJob(jobId);
      if (!status?.ok) { clearInterval(poll); return; }
      const newLines = (status.log || []).slice(lastLogLen);
      lastLogLen = status.log.length;
      newLines.forEach(line => {
        const cls = line.startsWith('Error') ? 'log-error' : line.startsWith('Found:') ? 'log-found' : line.startsWith('Done') ? 'log-done' : '';
        pushLog(line, cls);
      });
      if (status.status === 'done' || status.status === 'error') {
        clearInterval(poll);
        if (status.count > 0) { await loadSkillData(); render(); renderStats(); input.value = ''; Toast.success(`${status.count} imported.`); }
        setTimeout(() => { progressEl.style.opacity = '0'; setTimeout(() => progressEl.remove(), 500); }, 4000);
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 8h6M8 5v6"/><circle cx="8" cy="8" r="7"/></svg>'; btn.disabled = false; input.disabled = false;
      }
    }, 600);
  }

  function quickAdd(slug) {
    const input = document.getElementById('ingest-url');
    input.value = `https://github.com/${slug}`;
    ingest();
  }

  return { init, render, handleToggle, setFilter, setView, ingest, quickAdd, toggleSelect, selectAll, selectNone, bulkEnable, bulkDisable };
})();
