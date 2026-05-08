// config.js - Soul & Rules tab with keyboard save

const ConfigTab = (() => {
  const ruleFields = [
    ['rules-coding', 'rules-coding-count'],
    ['rules-general', 'rules-general-count'],
    ['rules-soul', 'rules-soul-count'],
  ];

  function load() {
    const r = RS.get();
    document.getElementById('rules-coding').value = r.coding || '';
    document.getElementById('rules-general').value = r.general || '';
    document.getElementById('rules-soul').value = r.soul || '';
    updateRuleMetrics();
  }

  function save() {
    if (typeof RulesLab !== 'undefined') RulesLab.beforeSave();
    RS.save({
      coding: document.getElementById('rules-coding').value.trim(),
      general: document.getElementById('rules-general').value.trim(),
      soul: document.getElementById('rules-soul').value.trim(),
    });
    updateRuleMetrics();
    flash('rules-saved');
  }

  async function reset() {
    const ok = await AppDialog.confirm({
      title: 'Reset rules',
      message: 'This replaces current rules and soul text with the default configuration.',
      confirmText: 'Reset',
      danger: true,
    });
    if (!ok) return;
    RS.save({ ...DEFAULT_RULES });
    load();
    if (typeof RulesLab !== 'undefined') RulesLab.beforeSave();
    flash('rules-saved');
    Toast.info('Rules reset to defaults');
  }

  function updateRuleMetrics() {
    ruleFields.forEach(([inputId, metricId]) => {
      const input = document.getElementById(inputId);
      const metric = document.getElementById(metricId);
      if (!input || !metric) return;
      const words = input.value.trim().split(/\s+/).filter(Boolean).length;
      const lines = input.value.split(/\n/).filter((line) => line.trim()).length;
      metric.textContent = `${words} words / ${lines} lines`;
    });
  }

  function flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  function initKeyboardSave() {
    document.getElementById('config-tab').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    });
  }

  // ---- API Key Management ----
  async function loadKeyStatus() {
    const el = document.getElementById('api-key-status');
    const input = document.getElementById('anthropic-api-key');
    if (!el || !input) return;
    try {
      const res = await fetch('/api/keys/status');
      const data = await res.json();
      if (data.ANTHROPIC_API_KEY) {
        el.textContent = 'Key configured';
        el.className = 'api-key-status ok';
        input.placeholder = '********************';
      } else {
        el.textContent = 'No key set';
        el.className = 'api-key-status';
      }
    } catch {}
  }

  async function saveApiKey() {
    const input = document.getElementById('anthropic-api-key');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
      Toast.error('Enter an API key');
      return;
    }
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ANTHROPIC_API_KEY', value }),
      });
      const data = await res.json();
      if (data.ok) {
        Toast.success('API key saved (encrypted)');
        input.value = '';
        loadKeyStatus();
      } else {
        Toast.error(data.error || 'Failed to save');
      }
    } catch (e) {
      Toast.error('Failed to save key');
    }
  }

  async function removeApiKey() {
    const ok = await AppDialog.confirm({
      title: 'Remove API key',
      message: 'This removes the stored encrypted Anthropic API key from this machine.',
      confirmText: 'Remove key',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ANTHROPIC_API_KEY' }),
      });
      const data = await res.json();
      if (data.ok) {
        Toast.success('API key removed');
        const input = document.getElementById('anthropic-api-key');
        if (input) input.placeholder = 'sk-ant-...';
        loadKeyStatus();
      }
    } catch (e) {
      Toast.error('Failed to remove key');
    }
  }

  function toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function init() {
    if (typeof RulesLab !== 'undefined') RulesLab.mount();
    load();
    initKeyboardSave();
    ruleFields.forEach(([inputId]) => {
      document.getElementById(inputId)?.addEventListener('input', () => {
        updateRuleMetrics();
        if (typeof RulesLab !== 'undefined') RulesLab.refresh();
      });
    });
    if (typeof RulesLab !== 'undefined') RulesLab.init();
    loadKeyStatus();
  }

  return { init, save, reset, saveApiKey, removeApiKey, toggleKeyVisibility, updateRuleMetrics };
})();
