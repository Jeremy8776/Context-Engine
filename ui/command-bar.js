// command-bar.js — ⌘K palette. Minimal, keyboard-first navigation.
// Hooks into existing switchTab / DashboardTab actions. No external deps.

const CommandBar = (() => {
  const CMDS = [
    { id: 'dashboard', label: 'Go to Context',       keys: ['context','dashboard','overview','home'], run: () => switchTabById('dashboard') },
    { id: 'skills',    label: 'Go to Skills',        keys: ['skills','library'],               run: () => switchTabById('skills') },
    { id: 'modes',     label: 'Go to Modes & Workflows', keys: ['modes','presets','workflows','chains','runs'], run: () => switchTabById('modes') },
    { id: 'memory',    label: 'Go to Memory',        keys: ['memory','about me'],              run: () => switchTabById('memory') },
    { id: 'config',    label: 'Go to Rules',         keys: ['rules','soul','config','keys'],   run: () => switchTabById('config') },
    { id: 'compile',   label: 'Go to Outputs',       keys: ['outputs','compile','deploy','export'], run: () => switchTabById('compile') },
    { id: 'discover',  label: 'Discover Skills',     keys: ['discover','scan'],                run: () => typeof DashboardTab !== 'undefined' && DashboardTab.discover() },
    { id: 'regen',     label: 'Regenerate CONTEXT.md', keys: ['regen','context','refresh'],    run: () => typeof DashboardTab !== 'undefined' && DashboardTab.regenCONTEXTmd() },
    { id: 'backup',    label: 'Create Backup',       keys: ['backup','snapshot','save state'], run: () => typeof DashboardTab !== 'undefined' && DashboardTab.backup() },
    { id: 'density',   label: 'Toggle density',      keys: ['density','compact','zoom'],       run: toggleDensity },
  ];

  let overlay, input, list, idx = 0, filtered = [];

  function switchTabById(name) {
    const btn = document.querySelector(`.tab-btn[onclick*="'${name}'"]`);
    if (btn) btn.click();
    close();
  }

  function toggleDensity() {
    const root = document.documentElement;
    const cur = root.getAttribute('data-density');
    root.setAttribute('data-density', cur === 'compact' ? '' : 'compact');
    close();
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'cmd-overlay';
    overlay.innerHTML = `
      <div class="cmd-shell" role="dialog" aria-label="Command palette">
        <div class="cmd-input-wrap">
          <span class="cmd-prompt">&gt;</span>
          <input class="cmd-input" type="text" placeholder="Type a command, tab, or action…" aria-label="Command">
          <kbd class="cmd-esc">ESC</kbd>
        </div>
        <div class="cmd-list" role="listbox"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    input = overlay.querySelector('.cmd-input');
    list  = overlay.querySelector('.cmd-list');

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, filtered.length - 1); render(true); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { idx = Math.max(idx - 1, 0); render(true); e.preventDefault(); }
    if (e.key === 'Enter' && filtered[idx]) { filtered[idx].run(); }
  }

  function render(skipFilter) {
    const q = (input.value || '').toLowerCase().trim();
    if (!skipFilter) {
      filtered = !q ? CMDS.slice() :
        CMDS.filter(c => c.label.toLowerCase().includes(q) || c.keys.some(k => k.includes(q)));
      idx = 0;
    }
    list.innerHTML = filtered.length ? filtered.map((c, i) => `
      <div class="cmd-item ${i === idx ? 'active' : ''}" data-i="${i}">
        <span class="cmd-item-label">${esc ? esc(c.label) : c.label}</span>
        <span class="cmd-item-meta">${c.keys[0]}</span>
      </div>
    `).join('') : '<div class="cmd-empty">No matches</div>';
    list.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => { idx = parseInt(el.dataset.i); filtered[idx].run(); });
      el.addEventListener('mouseenter', () => { idx = parseInt(el.dataset.i); render(true); });
    });
  }

  function open() {
    if (!overlay) build();
    overlay.classList.add('open');
    input.value = '';
    render();
    requestAnimationFrame(() => input.focus());
  }
  function close() {
    overlay && overlay.classList.remove('open');
  }
  function isOpen() { return overlay && overlay.classList.contains('open'); }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen() ? close() : open();
    }
  });

  return { open, close, isOpen };
})();
