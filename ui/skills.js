// skills.js — skills tab v4 (rows, search suggestions, categories, side panel)
const SkillsTab = (() => {
  let filter = 'all';
  let view = 'grid';
  let selected = new Set();
  let activeCategory = null;
  let activeSource = null;
  let selectedSkillId = null;
  let sidePanelCloseBound = false;
  let panelMode = null;

  const bc = (t) => (t === 'custom' ? 'badge-custom' : t === 'builtin' ? 'badge-builtin' : 'badge-external');
  const bl = (t) => (t === 'custom' ? 'custom' : t === 'builtin' ? 'built-in' : 'external');
  const SOURCE_LABELS = {
    'anthropics-skills': 'Anthropic',
    'openai-skills': 'OpenAI',
    'meta-llama-llama-cookbook': 'Meta',
  };

  function sourceFor(skill) {
    const p = (skill.path || '').replace(/\\/g, '/');
    const ingestMatch = p.match(/ingested\/([^/]+)/);
    if (!ingestMatch) {
      if (skill.type === 'builtin') return { id: 'local-bundle', label: 'Local bundle' };
      if (skill.type === 'external') return { id: 'external', label: 'External' };
      return { id: 'custom', label: 'Custom' };
    }
    const slug = ingestMatch[1];
    return {
      id: slug,
      label: SOURCE_LABELS[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    };
  }

  function categoryLabel(id) {
    const cat = CATEGORIES.find((c) => c.id === id);
    return cat
      ? cat.label
      : (id || 'Uncategorized').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderStats() {
    const total = SKILL_DATA.length;
    const active = SKILL_DATA.filter((s) => SS.active(s.id)).length;
    const tEl = document.getElementById('db-stat-total');
    const aEl = document.getElementById('db-stat-active');
    if (tEl) tEl.textContent = total;
    if (aEl) aEl.textContent = active;
  }

  function toggleSelect(id, e) {
    if (e) e.stopPropagation();
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    renderBulkBar();
    render();
  }

  function selectAll() {
    getVisible().forEach((s) => selected.add(s.id));
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
    renderBulkBar();
    renderStats();
    render();
  }

  function bulkDisable() {
    if (!selected.size) return;
    SS.setBulk([...selected], false);
    selected.clear();
    renderBulkBar();
    renderStats();
    render();
  }

  function renderBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    if (!selected.size) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.querySelector('.bulk-count').textContent = `${selected.size} selected`;
  }

  function setFilter(f) {
    filter = f;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
  }

  function setView(v) {
    view = v;
    document.getElementById('btn-grid')?.classList.toggle('on', v === 'grid');
    document.getElementById('btn-list')?.classList.toggle('on', v === 'list');
    render();
  }

  function getSources() {
    const counts = new Map();
    SKILL_DATA.forEach((skill) => {
      const source = sourceFor(skill);
      const current = counts.get(source.id) || { ...source, count: 0 };
      current.count += 1;
      counts.set(source.id, current);
    });
    const sources = [...counts.values()].sort((a, b) => {
      const priority = { 'local-bundle': 0, custom: 1, external: 2 };
      const ap = priority[a.id] ?? 3;
      const bp = priority[b.id] ?? 3;
      if (ap !== bp) return ap - bp;
      return a.label.localeCompare(b.label);
    });
    if (sources.length <= 1) activeSource = null;
    return sources;
  }

  function getCategories() {
    const counts = new Map();
    SKILL_DATA.forEach((skill) => {
      if (activeSource && sourceFor(skill).id !== activeSource) return;
      const id = skill.cat || 'uncategorized';
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    const cats = [...counts.entries()].sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));
    if (cats.length <= 1) activeCategory = null;
    return cats;
  }

  function sideFilterButton(kind, id, label, count, active) {
    const safeArg = String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const arg = id === null ? 'null' : `'${safeArg}'`;
    const fn = kind === 'source' ? 'setSource' : 'setCategory';
    return `<button class="skills-side-btn ${active ? 'active' : ''}" onclick="SkillsTab.${fn}(${arg})"><span>${esc(label)}</span><small>${count}</small></button>`;
  }

  function statusFilterButton(value, label, count) {
    const active = filter === value;
    return `<button class="skills-side-btn ${active ? 'active' : ''}" onclick="SkillsTab.setFilter('${value}')"><span>${label}</span><small>${count}</small></button>`;
  }

  function activeFilterCount() {
    return (filter !== 'all' ? 1 : 0) + (activeSource ? 1 : 0) + (activeCategory ? 1 : 0);
  }

  function updateFilterTrigger() {
    const trigger = document.getElementById('skills-filter-trigger');
    const countEl = document.getElementById('skills-filter-count');
    const count = activeFilterCount();
    trigger?.classList.toggle('on', count > 0);
    if (trigger) trigger.setAttribute('aria-label', count ? `Open filters, ${count} active` : 'Open filters');
    if (!countEl) return;
    countEl.hidden = count === 0;
    countEl.textContent = String(count);
  }

  function filterSection(title, body) {
    if (!body) return '';
    return `<div class="skills-side-section"><span class="skills-side-label">${title}</span><div class="skills-side-list">${body}</div></div>`;
  }

  function renderFilterPanel() {
    const activeCount = SKILL_DATA.filter((s) => SS.active(s.id)).length;
    const inactiveCount = SKILL_DATA.length - activeCount;
    const sources = getSources();
    const cats = getCategories();
    const catTotal = cats.reduce((sum, [, count]) => sum + count, 0);
    const reset = activeFilterCount()
      ? '<button class="fb skills-filter-reset" onclick="SkillsTab.clearFilters()">Reset Filters</button>'
      : '';

    return `<div class="sp-detail skills-filter-panel">
      ${reset}
      ${filterSection(
        'Status',
        statusFilterButton('all', 'All skills', SKILL_DATA.length) +
          statusFilterButton('active', 'Active', activeCount) +
          statusFilterButton('inactive', 'Inactive', inactiveCount),
      )}
      ${filterSection(
        'Sources',
        sources.length > 1
          ? sideFilterButton('source', null, 'All sources', SKILL_DATA.length, !activeSource) +
              sources
                .map((s) => sideFilterButton('source', s.id, s.label, s.count, activeSource === s.id))
                .join('')
          : '',
      )}
      ${filterSection(
        'Categories',
        cats.length > 1
          ? sideFilterButton('category', null, 'All categories', catTotal, !activeCategory) +
              cats
                .map(([id, count]) =>
                  sideFilterButton('category', id, categoryLabel(id), count, activeCategory === id),
                )
                .join('')
          : '',
      )}
    </div>`;
  }

  function refreshFilterPanel() {
    if (panelMode !== 'filters' || !SidePanel.isOpen()) return;
    const body = document.getElementById('sp-body');
    if (body) body.innerHTML = renderFilterPanel();
  }

  function openFilters() {
    selectedSkillId = null;
    panelMode = 'filters';
    render();
    SidePanel.open('Filters', renderFilterPanel());
  }

  function setSource(sourceId) {
    activeSource = sourceId;
    activeCategory = null;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
  }

  function setCategory(catId) {
    activeCategory = catId;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
  }

  function clearFilters() {
    filter = 'all';
    activeSource = null;
    activeCategory = null;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
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

  function truncate(str, max = 100) {
    if (!str || str.length <= max) return str || '';
    return str.substring(0, max).replace(/\s\S*$/, '') + '...';
  }

  function makeRow(skill) {
    const isActive = SS.active(skill.id);
    const isSel = selected.has(skill.id);
    const row = document.createElement('div');
    const isDetailSelected = selectedSkillId === skill.id;
    row.className = `skill-row${!isActive ? ' inactive' : ''}${isSel || isDetailSelected ? ' selected' : ''}`;
    row.setAttribute('data-skill-id', skill.id);

    const tags = (skill.tags || []).map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join('');
    const triggers = (skill.triggers || [])
      .slice(0, 3)
      .map((t) => `<span class="sr-trigger">${esc(t)}</span>`)
      .join('');
    const activeLbl = isActive ? 'Active' : 'Inactive';
    const shortDesc = truncate(skill.desc, 100);

    row.innerHTML = `
      <div class="sr-header">
        <div class="sr-name">${esc(skill.name || skill.id)}</div>
        <div class="sr-state-control" onclick="event.stopPropagation()">
          <span class="sr-active-lbl">${activeLbl}</span>
          ${makeToggle(skill, isActive)}
        </div>
      </div>
      <div class="sr-info">
        <div class="sr-desc">${esc(shortDesc)}</div>
        ${triggers ? `<div class="sr-triggers">${triggers}</div>` : ''}
      </div>
      <div class="sr-tags">
        <span class="badge ${bc(skill.type)}">${bl(skill.type)}</span>
        ${tags}
      </div>`;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      if (e.shiftKey) {
        toggleSelect(skill.id, e);
        return;
      }
      if (selectedSkillId === skill.id && SidePanel.isOpen()) {
        selectedSkillId = null;
        SidePanel.close();
        render();
        return;
      }
      openDetail(skill.id);
    });
    return row;
  }

  // ---- VISIBLE FILTER ----
  function getVisible() {
    const q = (document.getElementById('skills-search')?.value || '').toLowerCase();
    return SKILL_DATA.filter((s) => {
      if (filter === 'active' && !SS.active(s.id)) return false;
      if (filter === 'inactive' && SS.active(s.id)) return false;
      if (activeSource && sourceFor(s).id !== activeSource) return false;
      if (activeCategory && (s.cat || 'uncategorized') !== activeCategory) return false;
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

    const groups = {};
    visible.forEach((s) => {
      const group = categoryLabel(s.cat || 'uncategorized');
      if (!groups[group]) groups[group] = [];
      groups[group].push(s);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    const container = document.createElement('div');
    container.className = 'skills-container';

    sortedKeys.forEach((group) => {
      const skills = groups[group];
      const hdr = document.createElement('div');
      hdr.className = 'skill-group-header';
      hdr.textContent = `${group} (${skills.length})`;
      container.appendChild(hdr);
      skills.forEach((s) => container.appendChild(makeRow(s)));
    });

    list.appendChild(container);
  }

  // ---- SIDE PANEL DETAIL ----
  function openDetail(skillId) {
    const skill = SKILL_DATA.find((s) => s.id === skillId);
    if (!skill) return;
    panelMode = 'detail';
    selectedSkillId = skillId;
    const isActive = SS.active(skill.id);
    const source = sourceFor(skill);
    const tags = (skill.tags || []).map((t) => `<span class="badge badge-tag">${esc(t)}</span>`).join(' ');
    const triggers = (skill.triggers || [])
      .map((t) => `<span class="mode-skill-tag">${esc(t)}</span>`)
      .join(' ');
    render();

    const html = `
      <div class="sp-detail skill-detail">
        <div class="detail-panel-intro">
          <div class="detail-panel-meta">
            <span>${esc(source.label)}</span>
            <span>${esc(categoryLabel(skill.cat || 'uncategorized'))}</span>
            <span>${isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <p>${esc(skill.desc)}</p>
        </div>
        <div class="mode-detail-summary">
          <div><strong>${esc(bl(skill.type))}</strong><span>Type</span></div>
          <div><strong>${(skill.triggers || []).length}</strong><span>Triggers</span></div>
          <div><strong>${(skill.tags || []).length}</strong><span>Tags</span></div>
        </div>
        ${triggers ? `<div class="detail-section"><h4>Triggers</h4><div>${triggers}</div></div>` : ''}
        ${tags ? `<div class="detail-section"><h4>Tags</h4><div>${tags}</div></div>` : ''}
        ${skill.path ? `<div class="detail-section"><h4>Path</h4><code>${esc(skill.path)}</code></div>` : ''}
        <div class="sp-actions mode-detail-actions">
          <button class="save-btn" onclick="SkillsTab.handleToggle('${skill.id}', ${!isActive}); SkillsTab.openDetail('${skill.id}')">${isActive ? 'Disable Skill' : 'Enable Skill'}</button>
          <button class="save-btn ghost" onclick="SidePanel.close()">Close</button>
        </div>
      </div>`;
    SidePanel.open(skill.name || skill.id, html);
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
        if (q.length < 2) {
          suggest.classList.remove('open');
          render();
          return;
        }

        const matches = SKILL_DATA.filter(
          (s) => s.id.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q),
        ).slice(0, 8);

        if (!matches.length) {
          suggest.classList.remove('open');
          render();
          return;
        }

        suggest.innerHTML = matches
          .map((s) => {
            const safeId = esc(s.id);
            const highlighted = safeId.replace(
              new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
              '<span class="ss-match">$1</span>',
            );
            return `<div class="search-suggest-item" onmousedown="SkillsTab.applySuggestion('${s.id}')">${highlighted} <span class="search-suggest-desc">${esc(s.desc.slice(0, 40))}</span></div>`;
          })
          .join('');
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
    if (!sidePanelCloseBound) {
      document.addEventListener('sidepanel:close', () => {
        const hadSelection = Boolean(selectedSkillId);
        selectedSkillId = null;
        panelMode = null;
        if (hadSelection) render();
      });
      sidePanelCloseBound = true;
    }
    renderStats();
    updateFilterTrigger();
    initSearchSuggestions();
    render();
  }

  // ---- INGEST ----
  async function refreshAfterIngest() {
    await loadSkillData();
    updateFilterTrigger();
    render();
    renderStats();
  }

  async function ingest() {
    await SkillsIngest.ingest(refreshAfterIngest);
  }

  function quickAdd(slug) {
    SkillsIngest.quickAdd(slug);
  }

  function openConnectModal() {
    SkillsIngest.openConnectModal();
  }

  function closeConnectModal(event) {
    SkillsIngest.closeConnectModal(event);
  }

  async function parseDescriptions() {
    const unparsed = SKILL_DATA.filter((s) => s.needsParse).length;
    if (!unparsed) {
      Toast.success('All skills already have descriptions');
      return;
    }
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

  async function organiseLibrary() {
    const preview = await DS.organiseSkills(false);
    if (!preview?.ok) {
      Toast.error(preview?.error || 'Skill tidy preview failed');
      return;
    }
    const summary = preview.summary || {};
    const actionable =
      (summary.moved || 0) + (summary.duplicatesRemoved || 0) + (summary.emptyDirsRemoved || 0);
    if (!actionable) {
      if (summary.reviewNeeded) {
        Toast.warn(`${summary.reviewNeeded} non-skill item(s) need manual review`, 5000);
        return;
      }
      Toast.success('Skill library already tidy');
      return;
    }

    const ok = await AppDialog.confirm({
      title: 'Tidy skill library',
      message: `This will move ${summary.moved || 0} loose skill(s), remove ${summary.duplicatesRemoved || 0} duplicate import(s), and clear ${summary.emptyDirsRemoved || 0} empty folder(s). ${summary.mergeNeeded ? `${summary.mergeNeeded} local duplicate(s) need manual merge.` : ''} ${summary.reviewNeeded ? `${summary.reviewNeeded} non-skill item(s) will be left for review.` : ''}`,
      confirmText: 'Tidy library',
    });
    if (!ok) return;

    const result = await DS.organiseSkills(true);
    if (!result?.ok) {
      Toast.error(result?.error || 'Skill tidy failed');
      return;
    }
    await loadSkillData();
    renderStats();
    updateFilterTrigger();
    render();
    const done = result.summary || {};
    Toast.success(
      `Tidied skills: ${done.moved || 0} moved, ${done.duplicatesRemoved || 0} duplicates removed`,
    );
  }

  return {
    init,
    render,
    handleToggle,
    setFilter,
    clearFilters,
    openFilters,
    setView,
    setSource,
    setCategory,
    ingest,
    quickAdd,
    toggleSelect,
    selectAll,
    selectNone,
    bulkEnable,
    bulkDisable,
    openDetail,
    applySuggestion,
    parseDescriptions,
    organiseLibrary,
    openConnectModal,
    closeConnectModal,
  };
})();
