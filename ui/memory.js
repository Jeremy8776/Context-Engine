// memory.js -- memory tab with category browsing and focused inspection.

const MemoryTab = (() => {
  let memoryObj = { version: '1.1', entries: [] };
  let entries = [];
  let filter = 'all';
  let query = '';
  let selected = 0;
  let view = 'grid'; // 'grid' | 'list' — mirrors Skills tab pattern
  let panelMode = null;

  const categoryLabels = {
    profile: 'Profile',
    career: 'Career',
    technical: 'Technical',
    workspace: 'Workspace',
    people: 'People',
    health: 'Health',
    finance: 'Finance',
    photography: 'Photo',
    travel: 'Travel',
    personal: 'Personal',
    general: 'General',
  };

  function load() {
    memoryObj = MS.getData() || { version: '1.1', entries: [] };
    entries = memoryObj.entries || [];
  }

  function saveState() {
    memoryObj.entries = entries;
    MS.save(memoryObj);
  }

  function normalizeEntry(entry, index) {
    const text = typeof entry === 'string' ? entry : entry.content || '';
    const explicit = typeof entry === 'object' ? entry.category : '';
    const category = inferCategory(text, explicit);
    return {
      index,
      text,
      category,
      title: titleFor(text, category),
      // Short preview — CSS clamps to a few lines too, but truncating here
      // keeps the DOM small in card view where there are dozens on screen.
      preview: text.length > 140 ? `${text.slice(0, 140).trim()}...` : text,
      words: text.split(/\s+/).filter(Boolean).length,
    };
  }

  function inferCategory(text, explicit) {
    const value = String(explicit || '')
      .toLowerCase()
      .trim();
    if (value && value !== 'general') return value.replace(/[^a-z0-9-]/g, '-');

    // Generic keyword-based auto-categorization. Patterns are intentionally
    // broad so they work for any user. To extend with personal patterns,
    // edit this function locally — runtime user data lives in CE_ROOT/data/
    // not in the repo.
    const s = text.toLowerCase();
    if (/photo|photography|camera|lens|lightroom|capture/.test(s)) return 'photography';
    if (/health|fitness|exercise|diet|calories|bmi|sleep|heart rate|steps/.test(s)) return 'health';
    if (/partner|spouse|family|friend|colleague|teammate|pet/.test(s)) return 'people';
    if (/invoice|tax|budget|expense|income|salary|savings|rent|mortgage/.test(s)) return 'finance';
    if (/code|api|python|javascript|typescript|sql|docker|git|devops|terminal|cli/.test(s))
      return 'technical';
    if (/workspace|setup|desktop|laptop|machine|drive|monitor|keyboard/.test(s)) return 'workspace';
    if (/job|role|career|employer|client|resume|résumé|cv|linkedin|portfolio/.test(s)) return 'career';
    if (/travel|flight|hotel|trip|vacation|visit|holiday|airport/.test(s)) return 'travel';
    if (/childhood|biography|identity|background|history|origin/.test(s)) return 'personal';
    if (/born|date of birth|birthday|nickname/.test(s)) return 'profile';
    return 'general';
  }

  function titleFor(text, category) {
    // Falls through to a sentence-based heuristic. The previous version had
    // a hardcoded title map tuned to one user's biography; that's been
    // removed so the public repo doesn't ship personal-specific defaults.
    const sentence = text.split(/[.!?]\s/)[0] || text;
    const cleaned = sentence.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 68) return cleaned;
    return `${categoryLabels[category] || categoryLabels.general} memory`;
  }

  function visibleEntries() {
    const q = query.trim().toLowerCase();
    return entries
      .map(normalizeEntry)
      .filter((item) => filter === 'all' || item.category === filter)
      .filter((item) => !q || `${item.title} ${item.text}`.toLowerCase().includes(q));
  }

  function matchesQuery(item, q) {
    return !q || `${item.title} ${item.text}`.toLowerCase().includes(q);
  }

  function categoryCounts() {
    const q = query.trim().toLowerCase();
    const allItems = entries.map(normalizeEntry);
    const queryItems = allItems.filter((item) => matchesQuery(item, q));
    const counts = new Map();
    const queryCounts = new Map();
    allItems.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    queryItems.forEach((item) => queryCounts.set(item.category, (queryCounts.get(item.category) || 0) + 1));
    const cats = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { cats, queryItems, queryCounts };
  }

  function activeFilterCount() {
    return filter !== 'all' ? 1 : 0;
  }

  function updateFilterTrigger() {
    const trigger = document.getElementById('memory-filter-trigger');
    const countEl = document.getElementById('memory-filter-count');
    const count = activeFilterCount();
    trigger?.classList.toggle('on', count > 0);
    if (trigger) trigger.setAttribute('aria-label', count ? `Open filters, ${count} active` : 'Open filters');
    if (!countEl) return;
    countEl.hidden = count === 0;
    countEl.textContent = String(count);
  }

  function categoryFilterButton(id, count, visible) {
    const active = filter === id ? ' active' : '';
    const label = id === 'all' ? 'All categories' : categoryLabels[id] || sentenceCase(id);
    const metric = query.trim() ? `${visible}/${count}` : count;
    return `
      <button class="skills-side-btn${active}" onclick="MemoryTab.setFilter('${esc(id)}')">
        <span>${esc(label)}</span>
        <small>${metric}</small>
      </button>`;
  }

  function renderFilterPanel() {
    const { cats, queryItems, queryCounts } = categoryCounts();
    const reset = activeFilterCount()
      ? '<button class="fb skills-filter-reset" onclick="MemoryTab.clearFilters()">Reset Filters</button>'
      : '';
    const buttons =
      categoryFilterButton('all', entries.length, queryItems.length) +
      cats.map(([id, count]) => categoryFilterButton(id, count, queryCounts.get(id) || 0)).join('');
    return `<div class="sp-detail skills-filter-panel">
      ${reset}
      <div class="skills-side-section">
        <span class="skills-side-label">Categories</span>
        <div class="skills-side-list">${buttons}</div>
      </div>
    </div>`;
  }

  function refreshFilterPanel() {
    if (panelMode !== 'filters' || !SidePanel.isOpen()) return;
    const body = document.getElementById('sp-body');
    if (body) body.innerHTML = renderFilterPanel();
  }

  function openFilters() {
    panelMode = 'filters';
    SidePanel.open('Filters', renderFilterPanel());
  }

  function renderStats(items) {
    const host = document.getElementById('memory-stats');
    if (!host) return;
    const words = entries.map(normalizeEntry).reduce((sum, item) => sum + item.words, 0);
    host.innerHTML = `
      <span><b>${entries.length}</b> memories</span>
      <span><b>${items.length}</b> visible</span>
      <span><b>${words.toLocaleString()}</b> words</span>`;
  }

  function render() {
    const container = document.getElementById('memory-list');
    const items = visibleEntries();
    const gridClass = view === 'grid' ? ' grid-mode' : '';

    if (!items.length) {
      container.innerHTML = `
        <div class="memory-workbench no-detail">
          <section class="memory-results"><div class="db-empty">No memory entries match this view.</div></section>
        </div>`;
      return;
    }

    if (!items.some((item) => item.index === selected)) selected = items[0].index;

    // All items render into the scroll container — the container's own
    // overflow-y handles long lists. No pagination control: matches the
    // Skills tab pattern.
    container.innerHTML = `
      <div class="memory-workbench no-detail">
        <section class="memory-results">
          <div class="memory-results-scroll${gridClass}">
            ${items.map(renderRow).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderRow(item) {
    const active = item.index === selected ? ' active' : '';
    return `
      <button class="memory-card${active}" onclick="MemoryTab.select(${item.index})">
        <span class="memory-card-top">
          <span class="memory-title">${esc(item.title)}</span>
          <span class="memory-cat-badge mem-cat-${esc(item.category)}">${esc(categoryLabels[item.category] || item.category)}</span>
        </span>
        <span class="memory-preview">${esc(item.preview)}</span>
      </button>`;
  }

  function renderDetail(item) {
    // Read-only detail rendered inside the shared SidePanel. Edit and delete
    // route through the same actions as the inline panel did before.
    return `
      <div class="sp-detail">
        <div class="memory-detail-head">
          <span class="memory-cat-badge mem-cat-${esc(item.category)}">${esc(categoryLabels[item.category] || item.category)}</span>
          <p>${item.words} words</p>
        </div>
        <div class="memory-detail-body">${esc(item.text)}</div>
        <div class="sp-actions sp-actions-edit compact">
          <button class="save-btn" onclick="MemoryTab.startEdit(${item.index})">Edit</button>
          <button class="mem-btn danger push-end" onclick="MemoryTab.remove(${item.index})">Delete</button>
        </div>
      </div>`;
  }

  function openDetail(i) {
    panelMode = 'detail';
    const item = normalizeEntry(entries[i], i);
    const html = `
      <div class="sp-detail">
        <div class="sp-field"><label>Category</label><span class="memory-cat-badge mem-cat-${esc(item.category)}">${esc(categoryLabels[item.category] || item.category)}</span></div>
        <div class="sp-field">
          <label>Content</label>
          <textarea class="rules-textarea" id="mem-edit-${i}" rows="12">${esc(item.text)}</textarea>
        </div>
        <div class="sp-actions sp-actions-edit compact">
          <button class="save-btn" onclick="MemoryTab.saveEdit(${i})">Save</button>
          <button class="save-btn ghost" onclick="SidePanel.close()">Cancel</button>
          <button class="mem-btn danger push-end" onclick="MemoryTab.remove(${i})">Delete</button>
        </div>
      </div>`;
    SidePanel.open('Memory Entry', html);
    setTimeout(() => {
      const ta = document.getElementById(`mem-edit-${i}`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 0);
  }

  function select(i) {
    selected = i;
    const item = normalizeEntry(entries[i], i);
    panelMode = 'detail';
    render();
    SidePanel.open(item.title, renderDetail(item));
  }

  function setView(v) {
    view = v;
    document.getElementById('memory-btn-grid')?.classList.toggle('on', v === 'grid');
    document.getElementById('memory-btn-list')?.classList.toggle('on', v === 'list');
    render();
  }

  function setFilter(next) {
    filter = next;
    selected = 0;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
  }

  function clearFilters() {
    filter = 'all';
    selected = 0;
    updateFilterTrigger();
    render();
    refreshFilterPanel();
  }

  function startEdit(i) {
    openDetail(i);
  }

  function saveEdit(i) {
    const ta = document.getElementById(`mem-edit-${i}`);
    if (ta && ta.value.trim()) {
      const txt = ta.value.trim();
      if (typeof entries[i] === 'string') entries[i] = txt;
      else entries[i].content = txt;
      saveState();
    }
    SidePanel.close();
    render();
    if (typeof Toast !== 'undefined') Toast.success('Memory saved');
  }

  async function remove(i) {
    const ok = await AppDialog.confirm({
      title: 'Remove memory',
      message: 'This deletes the selected memory entry from memory.json.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    entries.splice(i, 1);
    selected = Math.max(0, Math.min(selected, entries.length - 1));
    saveState();
    SidePanel.close();
    render();
  }

  function addEntry(text, category = 'general') {
    text = String(text || '').trim();
    if (!text) return;
    entries.push({
      id: 'entry_' + Date.now(),
      category: inferCategory(text, category),
      label: '',
      content: text,
    });
    selected = entries.length - 1;
    saveState();
    render();
  }

  function openAddModal() {
    const overlay = document.getElementById('memory-modal-overlay');
    const input = document.getElementById('memory-modal-input');
    const category = document.getElementById('memory-modal-category');
    if (!overlay || !input || !category) return;
    input.value = '';
    category.value = filter !== 'all' ? filter : 'general';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 0);
  }

  function closeAddModal(event) {
    if (event && event.target.id !== 'memory-modal-overlay') return;
    document.getElementById('memory-modal-overlay')?.classList.remove('open');
  }

  function createFromModal() {
    const input = document.getElementById('memory-modal-input');
    const category = document.getElementById('memory-modal-category');
    const text = input?.value.trim();
    if (!text) return;
    addEntry(text, category?.value || 'general');
    closeAddModal();
    if (typeof Toast !== 'undefined') Toast.success('Memory added');
  }

  function sentenceCase(value) {
    return String(value || 'general')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function init() {
    load();
    updateFilterTrigger();
    render();
    const searchInput = document.getElementById('memory-search-input');
    searchInput?.addEventListener('input', (e) => {
      query = e.target.value || '';
      selected = 0;
      render();
      refreshFilterPanel();
    });
    document.getElementById('memory-modal-input')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        createFromModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAddModal();
    });
  }

  return {
    init,
    render,
    select,
    setFilter,
    clearFilters,
    openFilters,
    setView,
    startEdit,
    saveEdit,
    remove,
    addEntry,
    openAddModal,
    closeAddModal,
    createFromModal,
  };
})();
