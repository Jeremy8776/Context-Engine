// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// config.js - Soul & Rules tab with keyboard save

const ConfigTab = (() => {
  // Priority sections per rule category (must match RulesLab.PRIORITY_SECTIONS)
  const PRIORITY_SECTIONS = {
    coding: ['hard', 'preference', 'style'],
    general: ['hard', 'preference', 'style'],
    soul: ['preference'],
  };

  /** Get all textarea IDs for a given section key */
  function textareasFor(key) {
    return PRIORITY_SECTIONS[key].map((p) => `rules-${key}-${p}`);
  }

  /** Get all textarea IDs across all sections */
  function allTextareaIds() {
    return Object.keys(PRIORITY_SECTIONS).flatMap(textareasFor);
  }

  function load() {
    const r = RS.get();
    Object.keys(PRIORITY_SECTIONS).forEach((key) => {
      const section = r[key];
      PRIORITY_SECTIONS[key].forEach((p) => {
        const el = document.getElementById(`rules-${key}-${p}`);
        if (!el) return;
        if (typeof section === 'string') {
          el.value = p === 'preference' ? section : '';
        } else if (section && typeof section === 'object') {
          el.value = section[p] || '';
        } else {
          el.value = '';
        }
      });
    });
    updateRuleMetrics();
  }

  function save() {
    if (typeof RulesLab !== 'undefined') RulesLab.beforeSave();
    const data = {};
    Object.keys(PRIORITY_SECTIONS).forEach((key) => {
      data[key] = {};
      PRIORITY_SECTIONS[key].forEach((p) => {
        const el = document.getElementById(`rules-${key}-${p}`);
        data[key][p] = el?.value?.trim() || '';
      });
    });
    RS.save(data);
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
    RS.save(structuredClone(DEFAULT_RULES));
    load();
    if (typeof RulesLab !== 'undefined') RulesLab.beforeSave();
    flash('rules-saved');
    Toast.info('Rules reset to defaults');
  }

  function updateRuleMetrics() {
    Object.keys(PRIORITY_SECTIONS).forEach((key) => {
      const metric = document.getElementById(`rules-${key}-count`);
      if (!metric) return;
      let words = 0;
      let lines = 0;
      PRIORITY_SECTIONS[key].forEach((p) => {
        const el = document.getElementById(`rules-${key}-${p}`);
        if (!el) return;
        words += el.value.trim().split(/\s+/).filter(Boolean).length;
        lines += el.value.split(/\n/).filter((l) => l.trim()).length;
      });
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
    allTextareaIds().forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        updateRuleMetrics();
        if (typeof RulesLab !== 'undefined') RulesLab.refresh();
      });
    });
    if (typeof RulesLab !== 'undefined') RulesLab.init();
    loadKeyStatus();
  }

  return { init, save, reset, saveApiKey, removeApiKey, toggleKeyVisibility, updateRuleMetrics };
})();
