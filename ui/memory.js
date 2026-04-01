// memory.js — memory tab v4 (grid layout, category badges)

const MemoryTab = (() => {
  let memoryObj = { version: '1.1', entries: [] };
  let entries = [];
  let editing = null;

  function load() {
    memoryObj = MS.getData() || { version: '1.1', entries: [] };
    entries = memoryObj.entries || [];
  }

  function saveState() {
    memoryObj.entries = entries;
    MS.save(memoryObj);
  }

  function render() {
    const container = document.getElementById('memory-list');
    container.innerHTML = '';

    entries.forEach((entry, i) => {
      const text = typeof entry === 'string' ? entry : (entry.content || '');
      const cat = (typeof entry === 'object' && entry.category) ? entry.category : 'general';
      const item = document.createElement('div');
      item.className = 'memory-item';
      item.setAttribute('data-cat', cat);

      item.innerHTML = `
        <div class="memory-item-hdr">
          <span class="memory-cat-badge mem-cat-${cat}">${cat}</span>
        </div>
        <div class="memory-text">${escHtml(text)}</div>`;
      item.addEventListener('click', () => openDetail(i));
      container.appendChild(item);
    });

    if (editing !== null) {
      const ta = document.getElementById(`mem-edit-${editing}`);
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  function openDetail(i) {
    const entry = entries[i];
    if (!entry) return;
    const text = typeof entry === 'string' ? entry : (entry.content || '');
    const cat = (typeof entry === 'object' && entry.category) ? entry.category : 'general';
    const html = `
      <div class="sp-detail">
        <div class="sp-field"><label>Category</label><span class="memory-cat-badge mem-cat-${cat}">${cat}</span></div>
        <div class="sp-field">
          <label>Content</label>
          <textarea class="rules-textarea" id="mem-edit-${i}" rows="10">${escHtml(text)}</textarea>
        </div>
        <div class="sp-actions" style="margin-top:16px">
          <button class="save-btn" onclick="MemoryTab.saveEdit(${i})">Save</button>
          <button class="save-btn ghost" onclick="SidePanel.close()">Cancel</button>
          <button class="mem-btn danger" onclick="MemoryTab.remove(${i})" style="margin-left:auto">Delete</button>
        </div>
      </div>`;
    SidePanel.open('Memory Entry', html);
  }

  function startEdit(i) { openDetail(i); }

  function saveEdit(i) {
    const ta = document.getElementById(`mem-edit-${i}`);
    if (ta && ta.value.trim()) {
      const txt = ta.value.trim();
      if (typeof entries[i] === 'string') entries[i] = txt;
      else entries[i].content = txt;
      saveState();
    }
    editing = null;
    SidePanel.close();
    render();
    if (typeof Toast !== 'undefined') Toast.success('Memory saved');
  }

  function cancelEdit() { editing = null; render(); }

  function remove(i) {
    if (!confirm('Remove this memory entry?')) return;
    entries.splice(i, 1);
    if (editing === i) editing = null;
    saveState();
    SidePanel.close();
    render();
  }

  function addEntry() {
    const input = document.getElementById('memory-add-input');
    const text = input.value.trim();
    if (!text) return;
    entries.push({ id: 'entry_' + Date.now(), category: 'general', label: '', content: text });
    saveState();
    input.value = '';
    render();
    document.getElementById('memory-list').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  }

  // Use global esc() from utils.js — alias for backward compatibility
  const escHtml = esc;

  function flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  function init() {
    load();
    render();
    document.getElementById('memory-add-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addEntry(); }
    });
  }

  return { init, render, startEdit, saveEdit, cancelEdit, remove, addEntry };
})();
