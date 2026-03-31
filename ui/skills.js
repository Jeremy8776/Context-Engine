// skills.js — skills tab v4 (rows, search suggestions, categories, side panel)
const SkillsTab = (() => {
  let filter = 'all';
  let view = 'grid';
  let selected = new Set();
  let activeCategory = null;

  const bc = t => t === 'custom' ? 'badge-custom' : t === 'builtin' ? 'badge-builtin' : 'badge-external';
  const bl = t => t === 'custom' ? 'custom' : t === 'builtin' ? 'built-in' : 'external';

  function renderStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter(s => SS.active(s.id)).length;
    const tEl = document.getElementById('db-stat-total');
    const aEl = document.getElementById('db-stat-active');
    if (tEl) tEl.textContent = total;
    if (aEl) aEl.textContent = active;
  }

  // ---- SELECTION ----
  function toggleSelect(id, e) {
    if (e) e.stopPropagation();
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderBulkBar();
    render();
  }

  function selectAll() {
    getVisible().forEach(s => selected.add(s.id));
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

  // ---- FILTERS ----
  function setFilter(f, btn) {
    filter = f;
    document.querySelectorAll('#skills-tab .filters .fb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    render();
  }

  function setView(v) {
    view = v;
    document.getElementById('btn-grid')?.classList.toggle('on', v === 'grid');
    document.getElementById('btn-list')?.classList.toggle('on', v === 'list');
    render();
  }

  // ---- CATEGORIES ----
  function renderCategories() {
    const bar = document.getElementById('category-bar');
    if (!bar) return;
    if (!CATEGORIES.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<button class="cat-chip ${!activeCategory ? 'active' : ''}" onclick="SkillsTab.setCategory(null)">All</button>` +
      CATEGORIES.map(c => `<button class="cat-chip ${activeCategory === c.id ? 'active' : ''}" onclick="SkillsTab.setCategory('${c.id}')">${c.label}</button>`).join('');
  }

  function setCategory(catId) {
    activeCategory = catId;
    renderCategories();
    render();
  }

  // ---- TOGGLE ----
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

  // ---- ROW RENDERING ----
  function truncate(str, max = 100) {
    if (!str || str.length <= max) return str || '';
    return str.substring(0, max).replace(/\s\S*$/, '') + '...';
  }

  function makeRow(skill) {
    const isActive = SS.active(skill.id);
    const isSel = selected.has(skill.id);
    const row = document.createElement('div');
    row.className = `skill-row${!isActive ? ' inactive' : ''}${isSel ? ' selected' : ''}`;
    row.setAttribute('data-skill-id', skill.id);

    const tags = (skill.tags || []).map(t => `<span class="badge badge-tag">${t}</span>`).join('');
    const triggers = (skill.triggers || []).slice(0, 3).map(t => `<span class="sr-trigger">${t}</span>`).join('');
    const activeLbl = isActive ? 'Active' : 'Inactive';
    const shortDesc = truncate(skill.desc, 100);

    row.innerHTML = `
      <div class="sr-header">
        <div class="sr-name">${skill.name || skill.id}</div>
        <div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <span class="sr-active-lbl">${activeLbl}</span>
          ${makeToggle(skill, isActive)}
        </div>
      </div>
      <div class="sr-info">
        <div class="sr-desc">${shortDesc}</div>
        ${triggers ? `<div class="sr-triggers">${triggers}</div>` : ''}
      </div>
      <div class="sr-tags">
        <span class="badge ${bc(skill.type)}">${bl(skill.type)}</span>
        ${tags}
      </div>`;

    row.addEventListener('click', e => {
      if (e.target.closest('.toggle')) return;
      if (e.shiftKey) {
        toggleSelect(skill.id, e);
        return;
      }
      openDetail(skill.id);
    });
    return row;
  }

  // ---- VISIBLE FILTER ----
  function getVisible() {
    const q = (document.getElementById('skills-search')?.value || '').toLowerCase();
    return SKILL_DATA.filter(s => {
      if (filter === 'active'   && !SS.active(s.id)) return false;
      if (filter === 'inactive' &&  SS.active(s.id)) return false;
      if (activeCategory && s.cat !== activeCategory) return false;
      if (q && !s.id.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---- RENDER ----
  function render() {
    const list = document.getElementById('skills-list');
    list.innerHTML = '';
    list.classList.toggle('grid-mode', view === 'grid');
    list.classList.toggle('skills-selecting', selected.size > 0);

    const visible = getVisible();
    if (!visible.length) {
      list.innerHTML = '<div class="no-results">No skills match</div>';
      return;
    }

    // Group by source derived from path
    const SOURCE_LABELS = {
      'anthropics-skills': 'Anthropic',
      'openai-skills': 'OpenAI',
      'mattpocock-skills': 'Matt Pocock',
    };

    const groups = {};
    visible.forEach(s => {
      const p = (s.path || '').replace(/\\/g, '/');
      let group = 'Custom';
      const ingestMatch = p.match(/ingested\/([^/]+)/);
      if (ingestMatch) {
        const slug = ingestMatch[1];
        group = SOURCE_LABELS[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
      if (!groups[group]) groups[group] = [];
      groups[group].push(s);
    });

    // Sort: Custom first, then alphabetical
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Custom') return -1;
      if (b === 'Custom') return 1;
      return a.localeCompare(b);
    });

    const container = document.createElement('div');
    container.className = 'skills-container';

    sortedKeys.forEach(group => {
      const skills = groups[group];
      const hdr = document.createElement('div');
      hdr.className = 'skill-group-header';
      hdr.textContent = `${group} (${skills.length})`;
      container.appendChild(hdr);
      skills.forEach(s => container.appendChild(makeRow(s)));
    });

    list.appendChild(container);
  }

  // ---- SIDE PANEL DETAIL ----
  function openDetail(skillId) {
    const skill = SKILL_DATA.find(s => s.id === skillId);
    if (!skill) return;
    const isActive = SS.active(skill.id);
    const tags = (skill.tags || []).map(t => `<span class="badge badge-tag">${t}</span>`).join(' ');
    const triggers = (skill.triggers || []).map(t => `<span class="mode-skill-tag">${t}</span>`).join(' ');

    const html = `
      <div class="sp-detail">
        <div class="sp-status">
          ${makeToggle(skill, isActive)}
          <span style="margin-left:12px;color:var(--t2)">${isActive ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="sp-field"><label>Type</label><span class="badge ${bc(skill.type)}">${bl(skill.type)}</span></div>
        <div class="sp-field"><label>Category</label><span>${skill.cat || 'Uncategorized'}</span></div>
        <div class="sp-field"><label>Description</label><p>${skill.desc}</p></div>
        ${skill.path ? `<div class="sp-field"><label>Path</label><code>${skill.path}</code></div>` : ''}
        ${triggers ? `<div class="sp-field"><label>Triggers</label><div>${triggers}</div></div>` : ''}
        ${tags ? `<div class="sp-field"><label>Tags</label><div>${tags}</div></div>` : ''}
      </div>`;
    SidePanel.open(skill.id, html);
  }

  // ---- SEARCH SUGGESTIONS ----
  function initSearchSuggestions() {
    const input = document.getElementById('skills-search');
    const suggest = document.getElementById('search-suggest');
    if (!input || !suggest) return;
    let debounce;

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { suggest.classList.remove('open'); render(); return; }

        const matches = SKILL_DATA.filter(s =>
          s.id.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)
        ).slice(0, 8);

        if (!matches.length) { suggest.classList.remove('open'); render(); return; }

        suggest.innerHTML = matches.map(s => {
          const highlighted = s.id.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="ss-match">$1</span>');
          return `<div class="search-suggest-item" onmousedown="SkillsTab.applySuggestion('${s.id}')">${highlighted} <span style="color:var(--t3);font-size:11px;margin-left:8px">${s.desc.slice(0,40)}</span></div>`;
        }).join('');
        suggest.classList.add('open');
        render();
      }, 150);
    });

    input.addEventListener('blur', () => setTimeout(() => suggest.classList.remove('open'), 200));
  }

  function applySuggestion(skillId) {
    const input = document.getElementById('skills-search');
    if (input) input.value = skillId;
    document.getElementById('search-suggest')?.classList.remove('open');
    render();
    openDetail(skillId);
  }

  // ---- INIT ----
  function init() {
    renderStats();
    renderCategories();
    initSearchSuggestions();
    render();
  }

  // ---- INGEST ----
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

  async function parseDescriptions() {
    const unparsed = SKILL_DATA.filter(s => s.needsParse).length;
    if (!unparsed) { Toast.success('All skills already have descriptions'); return; }
    Toast.info(`Parsing ${unparsed} skills via LLM...`);
    const res = await DS.parseSkills();
    if (res?.ok) {
      Toast.success(`Parsed ${res.parsed}/${res.total} skills`);
      await loadSkillData();
      render();
    } else {
      Toast.error(res?.error || 'Parse failed');
    }
  }

  return {
    init, render, handleToggle, setFilter, setView, setCategory,
    ingest, quickAdd, toggleSelect, selectAll, selectNone,
    bulkEnable, bulkDisable, openDetail, applySuggestion, parseDescriptions,
  };
})();
