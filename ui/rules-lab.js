// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// rules-lab.js - Rules workbench helpers.

const RulesLab = (() => {
  const STORE_KEY = 'ce_rules_lab';
  const sections = ['coding', 'general', 'soul'];
  const labels = { coding: 'Coding Rules', general: 'General Rules', soul: 'Soul' };

  const PRIORITY_SECTIONS = {
    coding: ['hard', 'soft'],
    general: ['hard', 'soft'],
    soul: ['soft'],
  };

  const PRIORITY_LABELS = {
    hard: 'Hard rules',
    soft: 'Soft rules',
  };

  const defaultMeta = {
    enabled: { coding: true, general: true, soul: true },
    priority: { coding: 'hard', general: 'hard', soul: 'soft' },
    profiles: {},
    history: [],
    lastSaved: null,
  };

  let meta = loadMeta();
  let booted = false;

  function mount() {
    const root = document.getElementById('rules-root');
    if (!root || root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';
    root.innerHTML = `
      <section class="rules-hero">
        <div class="section-hdr">
          <h2>Soul &amp; Rules</h2>
          <p>Instruction policy written to <code>data\\rules.json</code></p>
        </div>
        <div class="rules-hero-end">
          <div class="rules-file-pill">
            <span>Active file</span>
            <code>data\\rules.json</code>
          </div>
          <div class="rules-hero-actions">
            <span class="saved-msg rules-saved-inline" id="rules-saved">Saved to disk</span>
            <button class="save-btn ghost" onclick="ConfigTab.reset()">Reset defaults</button>
            <button class="save-btn" onclick="ConfigTab.save()">Save changes</button>
          </div>
        </div>
      </section>
      <div class="rules-grid">
        ${ruleEditor('coding', 'Coding Rules')}
        ${ruleEditor('general', 'General Rules')}
        ${ruleEditor('soul', 'Soul')}
      </div>
      <section class="rules-workbench">
        <div class="rules-workbench-head">
          <div class="rules-workbench-title">
            <span>Review &amp; publish</span>
            <small>Preview output, check changes, and manage supporting rule sets.</small>
          </div>
          <div class="rules-tabs">
            ${panelTab('preview', 'Preview', true)}
            ${panelTab('changes', 'Changes')}
            ${panelTab('memory', 'Checks')}
            ${panelTab('profiles', 'Profiles')}
          </div>
        </div>
        <div class="rules-panel-stack">
        <section class="rules-panel rules-profile-tool" data-rule-panel="profiles" hidden>
          <div class="rules-tool-head"><span>Profiles</span><small>Preset rule sets</small></div>
          <div class="rules-profile-row">
            <select class="add-input" id="rules-profile-select"></select>
            <button class="fb small" onclick="RulesLab.applyProfile()">Apply</button>
            <button class="save-btn small" onclick="RulesLab.saveProfile()">Save profile</button>
          </div>
          <input class="add-input" id="rules-profile-name" type="text" placeholder="Profile name">
        </section>
        <section class="rules-panel rules-preview-tool" data-rule-panel="preview">
          <div class="rules-tool-head">
            <span>Compile Preview</span>
            <select class="add-input" id="rules-preview-target" onchange="RulesLab.refresh()">
              <option value="agents">AGENTS.md</option>
              <option value="claude">Claude Code</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
          <pre class="rules-preview" id="rules-preview"></pre>
        </section>
        <section class="rules-panel rules-changes-panel" data-rule-panel="changes" hidden>
          <div class="rules-tool-head">
            <span>Changes</span>
            <small id="rules-changes-summary">No changes</small>
          </div>
          <div class="rules-changes-grid">
            <div class="rules-change-column">
              <div class="rules-change-column-head">
                <span>Draft diff</span>
                <small id="rules-diff-summary">No changes</small>
              </div>
              <pre class="rules-diff" id="rules-diff"></pre>
            </div>
            <div class="rules-change-column">
              <div class="rules-change-column-head">
                <span>Snapshots</span>
                <small id="rules-history-summary">No snapshots</small>
              </div>
              <div class="rules-history-list" id="rules-history-list"></div>
            </div>
          </div>
        </section>
        <section class="rules-panel" data-rule-panel="memory" hidden>
          <div class="rules-tool-head"><span>Context Checks</span><small id="rules-memory-summary">Checking</small></div>
          <div class="rules-issue-list" id="rules-memory-list"></div>
        </section>
        </div>
      </section>
       `;
  }

  function ruleEditor(key, label) {
    const priorities = PRIORITY_SECTIONS[key];
    const isWide = key === 'soul';
    const sectionsHtml = priorities
      .map(
        (p) => `
      <div class="rules-priority-section">
        <label class="rules-priority-label">${PRIORITY_LABELS[p]}</label>
        <textarea class="rules-textarea" id="rules-${key}-${p}" rows="${isWide ? 5 : 3}"></textarea>
      </div>`,
      )
      .join('');
    return `
      <section class="rules-block${isWide ? ' rules-block-wide' : ''}">
        <div class="rules-block-hdr"><span>${label}</span><small id="rules-${key}-count">0 words</small></div>
        <div class="rules-block-controls">
          <label><input type="checkbox" class="styled-check" id="rules-${key}-enabled" checked onchange="RulesLab.refresh()"> Enabled</label>
        </div>
        <div class="rules-priority-group">
          ${sectionsHtml}
        </div>
      </section>`;
  }

  function panelTab(id, label, active = false) {
    return `<button class="rules-tab${active ? ' active' : ''}" data-rule-tab="${id}" onclick="RulesLab.switchPanel('${id}', this)">${label}</button>`;
  }

  function init() {
    if (booted) return;
    booted = true;
    applyMetaToControls();
    ensureDefaultProfiles();
    renderProfiles();
    captureBaseline();
    refresh();
  }

  function loadMeta() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY));
      return mergeMeta(stored);
    } catch {
      return mergeMeta(null);
    }
  }

  function mergeMeta(stored) {
    return {
      ...defaultMeta,
      ...(stored || {}),
      enabled: { ...defaultMeta.enabled, ...(stored?.enabled || {}) },
      priority: { ...defaultMeta.priority, ...(stored?.priority || {}) },
      profiles: { ...(stored?.profiles || {}) },
      history: Array.isArray(stored?.history) ? stored.history : [],
    };
  }

  function saveMeta() {
    localStorage.setItem(STORE_KEY, JSON.stringify(meta));
  }

  /** Read current values from all priority textareas into nested rules format */
  function draft() {
    const rules = {};
    for (const key of sections) {
      const priorities = PRIORITY_SECTIONS[key];
      rules[key] = {};
      for (const p of priorities) {
        const el = document.getElementById(`rules-${key}-${p}`);
        rules[key][p] = el?.value || '';
      }
    }
    return rules;
  }

  /** Set values of all priority textareas from a rules object (flat or nested) */
  function setDraft(rules) {
    sections.forEach((key) => {
      const priorities = PRIORITY_SECTIONS[key];
      const section = rules?.[key];
      priorities.forEach((p) => {
        const el = document.getElementById(`rules-${key}-${p}`);
        if (!el) return;
        if (typeof section === 'string') {
          el.value = p === 'soft' ? section : '';
        } else if (section && typeof section === 'object') {
          el.value = section[p] || '';
        } else {
          el.value = '';
        }
      });
    });
    ConfigTab.updateRuleMetrics?.();
    refresh();
  }

  function controlsToMeta() {
    sections.forEach((key) => {
      meta.enabled[key] = document.getElementById(`rules-${key}-enabled`)?.checked !== false;
    });
    saveMeta();
  }

  function applyMetaToControls() {
    sections.forEach((key) => {
      const enabled = document.getElementById(`rules-${key}-enabled`);
      if (enabled) enabled.checked = meta.enabled[key] !== false;
    });
  }

  function captureBaseline() {
    meta.lastSaved = draft();
    saveMeta();
  }

  function beforeSave() {
    controlsToMeta();
    const current = draft();
    pushHistory(meta.lastSaved || current);
    meta.lastSaved = current;
    saveMeta();
    refresh();
  }

  function pushHistory(rules) {
    if (!rules) return;
    const last = meta.history[0];
    const snapshot = {
      ts: new Date().toISOString(),
      rules,
      enabled: { ...meta.enabled },
    };
    if (last && JSON.stringify(last.rules) === JSON.stringify(rules)) return;
    meta.history = [snapshot, ...meta.history].slice(0, 12);
  }

  function ensureDefaultProfiles() {
    const defaults = {
      Default: {
        rules: {
          coding: { hard: '', soft: 'Modular code files.\nComment the why, not the what.' },
          general: { hard: '', soft: 'Memory is a core skill. Think independently.' },
          soul: { soft: 'Helpful, concise, and logical.\nObjective and critical thinker.' },
        },
        enabled: { ...defaultMeta.enabled },
      },
      'Strict Review': {
        rules: {
          coding: {
            hard: 'Prioritise bugs, regressions, missing tests, unsafe assumptions, and architecture drift.\nKeep findings specific and line-referenced.',
            soft: '',
          },
          general: {
            hard: 'Challenge weak reasoning. State uncertainty clearly. Do not overfit to the user request if the evidence points elsewhere.',
            soft: '',
          },
          soul: { soft: 'Direct, concise, critical, and practical.' },
        },
        enabled: { coding: true, general: true, soul: true },
      },
      Research: {
        rules: {
          coding: { hard: '', soft: 'Modular code files.\nComment the why, not the what.' },
          general: {
            hard: 'Verify time-sensitive facts. Prefer primary sources. Separate evidence from inference.',
            soft: '',
          },
          soul: { soft: 'Careful, source-led, and explicit about uncertainty.' },
        },
        enabled: { coding: true, general: true, soul: true },
      },
    };
    meta.profiles = { ...defaults, ...meta.profiles };
    saveMeta();
  }

  function renderProfiles() {
    const select = document.getElementById('rules-profile-select');
    if (!select) return;
    select.innerHTML = Object.keys(meta.profiles)
      .sort()
      .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
      .join('');
  }

  function saveProfile() {
    const input = document.getElementById('rules-profile-name');
    const name = (input?.value || '').trim();
    if (!name) {
      Toast.error('Profile name required');
      return;
    }
    controlsToMeta();
    meta.profiles[name] = {
      rules: draft(),
      enabled: { ...meta.enabled },
    };
    saveMeta();
    if (input) input.value = '';
    renderProfiles();
    const select = document.getElementById('rules-profile-select');
    if (select) select.value = name;
    Toast.success('Rule profile saved');
  }

  async function applyProfile() {
    const select = document.getElementById('rules-profile-select');
    const profile = meta.profiles[select?.value];
    if (!profile) return;
    const ok = await AppDialog.confirm({
      title: 'Apply rule profile',
      message: `Replace the editor contents with "${select.value}"? Unsaved edits will be overwritten.`,
      confirmText: 'Apply profile',
    });
    if (!ok) return;
    meta.enabled = { ...defaultMeta.enabled, ...(profile.enabled || {}) };
    applyMetaToControls();
    setDraft(profile.rules);
    saveMeta();
    Toast.success('Rule profile applied');
  }

  function refresh() {
    controlsToMeta();
    renderPreview();
    renderDiff();
    renderHistory();
    renderMemoryAlignment();
  }

  function switchPanel(id, btn = document.querySelector(`[data-rule-tab="${id}"]`)) {
    document.querySelectorAll('[data-rule-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.rulePanel !== id;
    });
    document.querySelectorAll('.rules-tab').forEach((tab) => {
      tab.classList.toggle('active', tab === btn || tab.dataset.ruleTab === id);
    });
  }

  function activeSections() {
    const rules = draft();
    return sections
      .filter((key) => meta.enabled[key] !== false)
      .map((key) => ({
        key,
        label: labels[key],
        text: flattenSectionText(rules[key], PRIORITY_SECTIONS[key]),
      }));
  }

  function flattenSectionText(section, priorities) {
    if (typeof section === 'string') return section;
    if (!section || typeof section !== 'object') return '';
    return priorities
      .map((p) => (section[p] || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  function renderPreview() {
    const host = document.getElementById('rules-preview');
    if (!host) return;
    const target = document.getElementById('rules-preview-target')?.value || 'agents';
    const items = activeSections();
    if (target === 'cursor') {
      host.textContent = items.map((item) => `${item.label}\n${item.text}`).join('\n\n');
      return;
    }
    const title = target === 'claude' ? '# Context Engine Rules' : '# Rules';
    host.textContent = `${title}\n\n${items.map((item) => `## ${item.label}\n${item.text}`).join('\n\n')}`;
  }

  function issue(kind, title, body) {
    return { kind, title, body };
  }

  function renderIssue(item) {
    return `<div class="rules-issue ${esc(item.kind)}"><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span></div>`;
  }

  function renderDiff() {
    const host = document.getElementById('rules-diff');
    const summary = document.getElementById('rules-diff-summary');
    const combined = document.getElementById('rules-changes-summary');
    if (!host || !summary) return;
    const before = flattenRules(meta.lastSaved || {});
    const after = flattenRules(draft());
    const diff = simpleDiff(before, after);
    summary.textContent = diff.changed ? `${diff.added} added / ${diff.removed} removed` : 'No changes';
    if (combined) {
      const snapshots = meta.history.length ? `${meta.history.length} snapshots` : 'no snapshots';
      combined.textContent = diff.changed
        ? `${diff.added} added / ${diff.removed} removed / ${snapshots}`
        : `No draft changes / ${snapshots}`;
    }
    host.textContent = diff.lines.join('\n') || 'No changes since last save.';
  }

  function flattenRules(rules) {
    return sections.flatMap((key) => {
      const section = rules?.[key];
      const priorities = PRIORITY_SECTIONS[key];
      const text = flattenSectionText(section, priorities);
      return [`## ${labels[key]}`, ...(text ? text.split('\n') : [])];
    });
  }

  function simpleDiff(before, after) {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const removed = before.filter((line) => !afterSet.has(line)).map((line) => `- ${line}`);
    const added = after.filter((line) => !beforeSet.has(line)).map((line) => `+ ${line}`);
    const context = after
      .filter((line) => beforeSet.has(line))
      .slice(0, 8)
      .map((line) => `  ${line}`);
    return {
      added: added.length,
      removed: removed.length,
      changed: added.length || removed.length,
      lines: [...removed, ...added, ...(added.length || removed.length ? [] : context)],
    };
  }

  function renderHistory() {
    const host = document.getElementById('rules-history-list');
    const summary = document.getElementById('rules-history-summary');
    if (!host || !summary) return;
    summary.textContent = meta.history.length ? `${meta.history.length} snapshots` : 'No snapshots';
    host.innerHTML = meta.history.length
      ? meta.history
          .map(
            (snap, index) => `
      <button class="rules-history-item" onclick="RulesLab.restoreHistory(${index})">
        <span>${esc(new Date(snap.ts).toLocaleString())}</span>
        <small>${wordsOf(flattenRulesText(snap.rules))} words</small>
      </button>`,
          )
          .join('')
      : '<div class="rules-empty">Save changes to create snapshots.</div>';
  }

  function flattenRulesText(rules) {
    return sections
      .map((key) => {
        const section = rules?.[key];
        const priorities = PRIORITY_SECTIONS[key];
        return flattenSectionText(section, priorities);
      })
      .join(' ');
  }

  async function restoreHistory(index) {
    const snap = meta.history[index];
    if (!snap) return;
    const ok = await AppDialog.confirm({
      title: 'Restore rule snapshot',
      message: 'Replace current editor content with this saved snapshot?',
      confirmText: 'Restore',
    });
    if (!ok) return;
    meta.enabled = { ...defaultMeta.enabled, ...(snap.enabled || {}) };
    applyMetaToControls();
    setDraft(snap.rules);
  }

  function renderMemoryAlignment() {
    const host = document.getElementById('rules-memory-list');
    const summary = document.getElementById('rules-memory-summary');
    if (!host || !summary) return;
    const notes = memoryAlignmentNotes();
    summary.textContent = notes.length ? `${notes.length} notes` : 'Aligned';
    host.innerHTML = notes.length
      ? notes.map(renderIssue).join('')
      : '<div class="rules-empty">No obvious context conflicts found.</div>';
  }

  function memoryAlignmentNotes() {
    const memory = MS.getData();
    const memoryText = (memory.entries || [])
      .map((entry) => (typeof entry === 'string' ? entry : entry.content || ''))
      .join('\n')
      .toLowerCase();
    const text = flattenRulesText(draft()).toLowerCase();
    const notes = [];
    if (
      /no memory|ignore memory|do not use memory/.test(text) &&
      /memory is a core skill|memory source of truth/.test(memoryText)
    ) {
      notes.push(
        issue(
          'error',
          'Memory conflict',
          'Rules appear to suppress memory while memory says it is core context.',
        ),
      );
    }
    if (
      /always agree|please the user|yes-man/.test(text) &&
      /not a yes-man|disagree with evidence/.test(memoryText)
    ) {
      notes.push(
        issue(
          'warn',
          'Personality conflict',
          'Rules may conflict with the stored preference to challenge weak assumptions.',
        ),
      );
    }
    if (
      !/verify|source|evidence|current|time-sensitive/.test(text) &&
      /cutoff|verify before time-sensitive/.test(memoryText)
    ) {
      notes.push(
        issue(
          'info',
          'Verification gap',
          'Memory includes time-sensitive verification guidance; consider reflecting it in General Rules.',
        ),
      );
    }
    return notes;
  }

  function wordsOf(text) {
    return String(text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  return {
    mount,
    init,
    refresh,
    beforeSave,
    saveProfile,
    applyProfile,
    restoreHistory,
    switchPanel,
    PRIORITY_SECTIONS,
  };
})();
