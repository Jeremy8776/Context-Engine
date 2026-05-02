// memory.js -- memory tab with category browsing and focused inspection.

const MemoryTab = (() => {
  let memoryObj = { version: '1.1', entries: [] };
  let entries = [];
  let filter = 'all';
  let query = '';
  let selected = 0;
  let currentPage = 1;
  const pageSize = 20;

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
      preview: text.length > 220 ? `${text.slice(0, 220).trim()}...` : text,
      words: text.split(/\s+/).filter(Boolean).length,
    };
  }

  function inferCategory(text, explicit) {
    const value = String(explicit || '')
      .toLowerCase()
      .trim();
    if (value && value !== 'general') return value.replace(/[^a-z0-9-]/g, '-');

    const s = text.toLowerCase();
    if (/fujifilm|x100vi|film sim|photography|gyazo|captioning images/.test(s)) return 'photography';
    if (/acid reflux|gerd|bmi|heart rate|osgood|muay thai|health|fitness|watch 6|steps|calories/.test(s))
      return 'health';
    if (/partner|partner|buddy|family|zhengzhou/.test(s)) return 'people';
    if (/invoice|tax|contractor|income|rent|council tax|savings|foreign income/.test(s)) return 'finance';
    if (
      /comfyui|python|node|powershell|mtcnn|insightface|yolo|diffusion|api|mcp|arma|enscript|blender/.test(s)
    )
      return 'technical';
    if (/windows pc|workstation|e:\\|c:\\|workspace|drive|data\\memory|claude/.test(s)) return 'workspace';
    if (
      /job search|director|strategist|studio|acme|client|portfolio|linkedin|cv|mpts|redundancy/.test(
        s,
      )
    )
      return 'career';
    if (/travel|chengdu|jiuzhaigou|flight|china|mont blanc|ben nevis|snowdonia|cairngorms/.test(s))
      return 'travel';
    if (/born|foster|adoption|birth mother|birth father|memory suppression|stress response/.test(s))
      return 'personal';
    if (/jeremy walder|ravensbourne|east london|first home/.test(s)) return 'profile';
    return 'general';
  }

  function titleFor(text, category) {
    const known = [
      [/jeremy walder/i, 'Identity and background'],
      [/active job search/i, 'Current positioning'],
      [/director of ai strategy at acme/i, 'Acme role'],
      [/studio/i, 'Studio role'],
      [/never reference as clients/i, 'Client history and exclusions'],
      [/comfyui/i, 'ComfyUI and AI production stack'],
      [/windows pc/i, 'Machine and workspace'],
      [/partner partner/i, 'Partner context'],
      [/white cavapoo/i, 'Buddy'],
      [/foster care/i, 'Early life context'],
      [/visual memory suppression/i, 'Memory suppression model'],
      [/height 176cm/i, 'Health baseline'],
      [/strong athletic baseline/i, 'Fitness baseline'],
      [/fujifilm x100vi/i, 'Photography setup'],
      [/arma reforger/i, 'Games and modding'],
      [/uk-based contractor/i, 'Contractor finance'],
      [/three-week family visit/i, 'China trip'],
      [/personal website/i, 'Public positioning gap'],
    ];
    const match = known.find(([pattern]) => pattern.test(text));
    if (match) return match[1];

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

  function pageTotal(items) {
    return Math.max(1, Math.ceil(items.length / pageSize));
  }

  function clampPage(items) {
    currentPage = Math.min(Math.max(1, currentPage), pageTotal(items));
  }

  function currentPageItems(items) {
    clampPage(items);
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }

  function matchesQuery(item, q) {
    return !q || `${item.title} ${item.text}`.toLowerCase().includes(q);
  }

  function categories() {
    const q = query.trim().toLowerCase();
    const allItems = entries.map(normalizeEntry);
    const queryItems = allItems.filter((item) => matchesQuery(item, q));
    const counts = new Map();
    const queryCounts = new Map();
    allItems.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    queryItems.forEach((item) => queryCounts.set(item.category, (queryCounts.get(item.category) || 0) + 1));
    const cats = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return [['all', entries.length], ...cats]
      .map(([id, count]) => {
        const active = filter === id ? ' active' : '';
        const label = id === 'all' ? 'All' : categoryLabels[id] || sentenceCase(id);
        const visible = id === 'all' ? queryItems.length : queryCounts.get(id) || 0;
        const metric = q ? `${visible}/${count}` : count;
        return `
        <button class="memory-filter${active}" onclick="MemoryTab.setFilter('${esc(id)}')">
          <span>${esc(label)}</span>
          <small>${metric}</small>
        </button>`;
      })
      .join('');
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
    clampPage(items);

    if (!items.length) {
      container.innerHTML = `
        <div class="memory-workbench">
          <aside class="memory-sidebar">${categories()}</aside>
          <section class="memory-results"><div class="db-empty">No memory entries match this view.</div></section>
          <aside class="memory-detail empty">Select a memory to inspect it.</aside>
        </div>`;
      return;
    }

    const pageItems = currentPageItems(items);
    if (!pageItems.some((item) => item.index === selected)) selected = pageItems[0].index;
    const selectedItem = pageItems.find((item) => item.index === selected) || pageItems[0];
    selected = selectedItem.index;

    container.innerHTML = `
      <div class="memory-workbench">
        <aside class="memory-sidebar">${categories()}</aside>
        <section class="memory-results">
          <div class="memory-results-scroll">
            ${pageItems.map(renderRow).join('')}
          </div>
          ${renderPagination(items)}
        </section>
        <aside class="memory-detail" id="memory-detail">${renderDetail(selectedItem)}</aside>
      </div>`;
  }

  function renderPagination(items) {
    if (items.length <= pageSize) return '';
    const total = pageTotal(items);
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(start + pageSize - 1, items.length);
    const prevDisabled = currentPage <= 1 ? ' disabled' : '';
    const nextDisabled = currentPage >= total ? ' disabled' : '';
    return `
      <div class="memory-pagination" aria-label="Memory pagination">
        <span>${start}-${end} of ${items.length}</span>
        <button class="mem-btn" type="button" onclick="MemoryTab.setPage(${currentPage - 1})"${prevDisabled} title="Previous page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          <span>Prev</span>
        </button>
        <span class="memory-page-count">Page ${currentPage} / ${total}</span>
        <button class="mem-btn" type="button" onclick="MemoryTab.setPage(${currentPage + 1})"${nextDisabled} title="Next page">
          <span>Next</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
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
    return `
      <div class="memory-detail-head">
        <span class="memory-cat-badge mem-cat-${esc(item.category)}">${esc(categoryLabels[item.category] || item.category)}</span>
        <h3>${esc(item.title)}</h3>
        <p>${item.words} words</p>
      </div>
      <div class="memory-detail-body">${esc(item.text)}</div>
      <div class="memory-detail-actions">
        <button class="save-btn" onclick="MemoryTab.startEdit(${item.index})">Edit</button>
        <button class="mem-btn danger" onclick="MemoryTab.remove(${item.index})">Delete</button>
      </div>`;
  }

  function openDetail(i) {
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
    render();
  }

  function setFilter(next) {
    filter = next;
    currentPage = 1;
    selected = 0;
    render();
  }

  function setPage(next) {
    currentPage = next;
    render();
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
    currentPage = Math.min(currentPage, pageTotal(visibleEntries()));
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
    currentPage = pageTotal(visibleEntries());
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
    render();
    const searchInput = document.getElementById('memory-search-input');
    searchInput?.addEventListener('input', (e) => {
      query = e.target.value || '';
      currentPage = 1;
      selected = 0;
      render();
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
    setPage,
    startEdit,
    saveEdit,
    remove,
    addEntry,
    openAddModal,
    closeAddModal,
    createFromModal,
  };
})();
