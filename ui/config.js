// config.js — Soul & Rules tab with keyboard save

const ConfigTab = (() => {
  function load() {
    const r = RS.get();
    document.getElementById('rules-coding').value = r.coding || '';
    document.getElementById('rules-general').value = r.general || '';
    document.getElementById('rules-soul').value = r.soul || '';
  }

  function save() {
    RS.save({
      coding: document.getElementById('rules-coding').value.trim(),
      general: document.getElementById('rules-general').value.trim(),
      soul: document.getElementById('rules-soul').value.trim(),
    });
    flash('rules-saved');
  }

  function reset() {
    if (!confirm('Reset all rules and soul to defaults?')) return;
    RS.save({ ...DEFAULT_RULES });
    load();
    flash('rules-saved');
    Toast.info('Rules reset to defaults');
  }

  function flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  function initKeyboardSave() {
    document.getElementById('config-tab').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    });
  }

  function init() {
    load();
    initKeyboardSave();
  }

  return { init, save, reset };
})();