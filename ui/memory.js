// memory.js — memory tab rendering and editing

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
      const item = document.createElement('div');
      item.className = 'memory-item';

      if (editing === i) {
        item.innerHTML = `
          <div class="memory-item-hdr">
            <span class="memory-idx">#${i + 1}</span>
            <div class="memory-actions">
              <button class="mem-btn save" onclick="MemoryTab.saveEdit(${i})">save</button>
              <button class="mem-btn" onclick="MemoryTab.cancelEdit()">cancel</button>
            </div>
          </div>
          <textarea class="memory-textarea" id="mem-edit-${i}">${escHtml(text)}</textarea>`;
      } else {
        item.innerHTML = `
          <div class="memory-item-hdr">
            <span class="memory-idx">#${i + 1}</span>
            <div class="memory-actions">
              <button class="mem-btn" onclick="MemoryTab.startEdit(${i})">edit</button>
              <button class="mem-btn danger" onclick="MemoryTab.remove(${i})">remove</button>
            </div>
          </div>
          <div class="memory-text">${escHtml(text)}</div>`;
      }
      container.appendChild(item);
    });

    if (editing !== null) {
      const ta = document.getElementById(`mem-edit-${editing}`);
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  function startEdit(i) { editing = i; render(); }

  function saveEdit(i) {
    const ta = document.getElementById(`mem-edit-${i}`);
    if (ta && ta.value.trim()) { 
      const txt = ta.value.trim();
      if (typeof entries[i] === 'string') entries[i] = txt;
      else entries[i].content = txt;
      saveState(); 
    }
    editing = null;
    render();
    flash('memory-saved');
  }

  function cancelEdit() { editing = null; render(); }

  function remove(i) {
    if (!confirm('Remove this memory entry?')) return;
    entries.splice(i, 1);
    if (editing === i) editing = null;
    saveState();
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

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

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
