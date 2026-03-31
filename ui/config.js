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

  // ---- API Key Management ----
  async function loadKeyStatus() {
    try {
      const res = await fetch('/api/keys/status');
      const data = await res.json();
      const el = document.getElementById('api-key-status');
      if (data.ANTHROPIC_API_KEY) {
        el.textContent = 'Key configured';
        el.className = 'api-key-status set';
        document.getElementById('anthropic-api-key').placeholder = '••••••••••••••••••••';
      } else {
        el.textContent = 'No key set';
        el.className = 'api-key-status';
      }
    } catch {}
  }

  async function saveApiKey() {
    const input = document.getElementById('anthropic-api-key');
    const value = input.value.trim();
    if (!value) { Toast.error('Enter an API key'); return; }
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ANTHROPIC_API_KEY', value })
      });
      const data = await res.json();
      if (data.ok) {
        Toast.success('API key saved (encrypted)');
        input.value = '';
        loadKeyStatus();
      } else {
        Toast.error(data.error || 'Failed to save');
      }
    } catch (e) { Toast.error('Failed to save key'); }
  }

  async function removeApiKey() {
    if (!confirm('Remove the stored API key?')) return;
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ANTHROPIC_API_KEY' })
      });
      const data = await res.json();
      if (data.ok) {
        Toast.success('API key removed');
        document.getElementById('anthropic-api-key').placeholder = 'sk-ant-...';
        loadKeyStatus();
      }
    } catch (e) { Toast.error('Failed to remove key'); }
  }

  function toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function init() {
    load();
    initKeyboardSave();
    loadKeyStatus();
  }

  return { init, save, reset, saveApiKey, removeApiKey, toggleKeyVisibility };
})();