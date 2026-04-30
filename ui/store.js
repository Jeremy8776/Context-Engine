// store.js — data layer + toast notifications for Context Engine v3

const API = '/api';

// ---- APP DIALOGS ----
const AppDialog = (() => {
  let root;
  let activeResolve = null;

  function ensure() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'app-dialog-overlay';
    root.innerHTML = `
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <div class="app-dialog-head">
          <div>
            <h3 id="app-dialog-title"></h3>
            <p id="app-dialog-message"></p>
          </div>
          <button class="icon-btn app-dialog-close" title="Close" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="app-dialog-actions">
          <button class="fb app-dialog-cancel" type="button">Cancel</button>
          <button class="save-btn app-dialog-confirm" type="button">Confirm</button>
        </div>
      </section>`;
    document.body.appendChild(root);
    root.querySelector('.app-dialog-close').addEventListener('click', () => settle(false));
    root.querySelector('.app-dialog-cancel').addEventListener('click', () => settle(false));
    root.querySelector('.app-dialog-confirm').addEventListener('click', () => settle(true));
    root.addEventListener('click', e => {
      if (e.target === root) settle(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && root.classList.contains('open')) settle(false);
    });
    return root;
  }

  function settle(value) {
    ensure().classList.remove('open', 'danger');
    if (activeResolve) activeResolve(value);
    activeResolve = null;
  }

  function confirm(options = {}) {
    const el = ensure();
    el.querySelector('#app-dialog-title').textContent = options.title || 'Confirm action';
    el.querySelector('#app-dialog-message').textContent = options.message || 'Are you sure?';
    el.querySelector('.app-dialog-confirm').textContent = options.confirmText || 'Confirm';
    el.querySelector('.app-dialog-cancel').textContent = options.cancelText || 'Cancel';
    el.classList.toggle('danger', !!options.danger);
    el.classList.add('open');
    return new Promise(resolve => {
      activeResolve = resolve;
      setTimeout(() => el.querySelector('.app-dialog-confirm')?.focus(), 0);
    });
  }

  return { confirm };
})();

// ---- TOAST SYSTEM ----
const Toast = (() => {
  let container;
  function init() {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  function show(message, type = 'info', duration = 3000, action = null) {
    if (!container) init();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'OK' : type === 'error' ? '!' : type === 'warning' ? '!' : 'i';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message"></span>`;
    el.querySelector('.toast-message').textContent = message;
    if (action?.label && action?.onClick) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      el.appendChild(btn);
    }
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    if (duration > 0) {
      setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 300);
      }, duration);
    }
  }
  return {
    info:    (msg, dur) => show(msg, 'info', dur),
    success: (msg, dur) => show(msg, 'success', dur),
    error:   (msg, dur) => show(msg, 'error', dur || 5000),
    warn:    (msg, dur) => show(msg, 'warning', dur),
    action:  (msg, label, onClick) => show(msg, 'info', 0, { label, onClick }),
  };
})();
// ---- API FETCH ----
async function apiFetch(path, method = 'GET', payload = null, options = {}) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (payload) opts.body = JSON.stringify(payload);
    const res = await fetch(`${API}${path}`, opts);
    let data = null;
    try { data = await res.json(); } catch (je) {
       console.error(`API Parse Error: ${path}`, je);
       Toast.error(`Server error: '${path}' returned non-JSON response.`);
       return null;
    }
      if (!res.ok) {
        Toast.error(data.error || `Request failed (${res.status})`);
        return options.returnErrors ? { ok: false, status: res.status, ...(data || {}) } : null;
      }
    return data;
  } catch (e) {
    Toast.error(`Connection failed: ${e.message}`);
    return null;
  }
}

// ---- SERVER STATUS ----
const ServerStatus = {
  online: false,
  async check() {
    const data = await apiFetch('/memory');
    this.online = data !== null;
    const el = document.getElementById('server-status');
    if (el) {
      el.textContent = this.online ? 'Live' : 'Offline';
      el.className = 'server-status ' + (this.online ? 'online' : 'offline');
    }
    return this.online;
  }
};
// ---- SKILL DATA (fetched from server) ----
let MEMORY_CATEGORIES = [];

async function loadSkillData() {
  const resp = await apiFetch('/skills');
  const data = (resp && resp.skills) ? resp.skills : resp;
  if (data && Array.isArray(data)) {
    SKILL_DATA = data;
    CATEGORIES = (resp && resp.categories) ? resp.categories : [];
  }
}

// ---- SKILL STATES ----
const SS = {
  _cache: null,
  get() {
    if (this._cache) return this._cache;
    try { this._cache = JSON.parse(localStorage.getItem('ce_ss')) || {}; }
    catch { this._cache = {}; }
    return this._cache;
  },
  set(id, v) {
    const s = this.get();
    s[id] = v;
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (ServerStatus.online) {
      apiFetch('/states', 'POST', {
        version: '1.0', last_updated: new Date().toISOString().split('T')[0], states: s,
      }).then(r => {
        if (r && r.activeCount !== undefined) {
          Toast.success(`${r.activeCount} skills active`);
          if (typeof DashboardTab !== 'undefined') DashboardTab.refreshBudget();
        }
      });
    }
  },
  active(id) {
    const s = this.get();
    if (id in s) return s[id];
    const sk = SKILL_DATA.find(x => x.id === id);
    return sk ? sk.type !== 'external' : true;
  },
  async loadFromServer() {
    const data = await apiFetch('/states');
    if (data) {
      const states = data.states || data;
      this._cache = states;
      localStorage.setItem('ce_ss', JSON.stringify(states));
    }
  },
  applyServerStates(states) {
    this._cache = states;
    localStorage.setItem('ce_ss', JSON.stringify(states));
  },
  async applyReview(ids, keepId) {
    const s = { ...this.get() };
    ids.forEach(id => { s[id] = id === keepId; });
    return await this.saveStates(s);
  },
  async applyReviewChoices(choices) {
    const s = { ...this.get() };
    choices.forEach(({ ids, keepId }) => ids.forEach(id => { s[id] = id === keepId; }));
    return await this.saveStates(s);
  },
  async saveStates(s) {
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (!ServerStatus.online) return { ok: true, localOnly: true };
    return await apiFetch('/states', 'POST', {
      version: '1.0', last_updated: new Date().toISOString().split('T')[0], states: s,
    }, { returnErrors: true });
  },
  setBulk(ids, value) {
    const s = this.get();
    ids.forEach(id => { s[id] = value; });
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (ServerStatus.online) {
      apiFetch('/states', 'POST', {
        version: '1.0', last_updated: new Date().toISOString().split('T')[0], states: s,
      }).then(r => {
        if (r && r.activeCount !== undefined) {
          Toast.success(`${r.activeCount} skills active`);
          if (typeof DashboardTab !== 'undefined') DashboardTab.refreshBudget();
        }
      });
    }
  }
};
// ---- MEMORY ----
const MS = {
  _data: null,
  getData() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem('ce_mem_v2');
      if (raw) { this._data = JSON.parse(raw); return this._data; }
    } catch {}
    return { version: '1.1', entries: [] };
  },
  save(memoryData) {
    this._data = memoryData;
    memoryData.last_updated = new Date().toISOString().split('T')[0];
    localStorage.setItem('ce_mem_v2', JSON.stringify(memoryData));
    if (ServerStatus.online) {
      apiFetch('/memory', 'POST', memoryData).then(r => {
        if (r?.ok) Toast.success('Memory saved');
        else Toast.error('Failed to save memory');
      });
    }
  },
  async loadFromServer() {
    const data = await apiFetch('/memory');
    if (data && data.entries) {
      this._data = data;
      localStorage.setItem('ce_mem_v2', JSON.stringify(data));
      return data;
    }
    return null;
  }
};

// ---- RULES ----
const RS = {
  _cache: null,
  get() {
    if (this._cache) return this._cache;
    try { const s = JSON.parse(localStorage.getItem('ce_rules')); if (s) { this._cache = s; return s; } }
    catch {}
    return { ...DEFAULT_RULES };
  },
  save(rules) {
    this._cache = rules;
    localStorage.setItem('ce_rules', JSON.stringify(rules));
    if (ServerStatus.online) {
      apiFetch('/rules', 'POST', { version: '1.0', last_updated: new Date().toISOString().split('T')[0], ...rules }).then(r => {
        if (r?.ok) Toast.success('Rules saved');
        else Toast.error('Failed to save rules');
      });
    }
  },
  async loadFromServer() {
    const data = await apiFetch('/rules');
    if (data) {
      const rules = { coding: data.coding, general: data.general, soul: data.soul };
      this._cache = rules;
      localStorage.setItem('ce_rules', JSON.stringify(rules));
      return rules;
    }
    return null;
  }
};
// ---- DASHBOARD DATA ----
const DS = {
  async getHealth()      { return await apiFetch('/health'); },
  async getContextMd()    { return await apiFetch('/context-md'); },
  async regenContextMd()  { return await apiFetch('/context-md', 'POST'); },
  async getBudget()      { return await apiFetch('/health'); },
  async getBackups()     { return await apiFetch('/backups'); },
  async createBackup()   { return await apiFetch('/backups', 'POST'); },
  async restoreBackup(ts) { return await apiFetch('/restore', 'POST', { timestamp: ts }); },
  async getSessionLog()  { return await apiFetch('/session-log'); },
  async logSession(e)    { return await apiFetch('/session-log', 'POST', e); },
  async getModes()       { return await apiFetch('/modes'); },
  async applyMode(id)    { return await apiFetch('/modes/apply', 'POST', { modeId: id }); },
  async ingestRepo(url)  { return await apiFetch('/skills/ingest', 'POST', { url }); },
  async pollIngestJob(jobId) { return await apiFetch(`/skills/ingest/${jobId}`); },
  async parseSkills(options = {}) { return await apiFetch('/skills/parse', 'POST', options, { returnErrors: true }); },
  async organiseSkills(apply = true) { return await apiFetch('/skills/organise', 'POST', { apply }); },
    async reviewSimilarSkills(options = {}) { return await apiFetch('/skills/review-similar', 'POST', options, { returnErrors: true }); },
    async getOllamaModels() { return await apiFetch('/llm/ollama-models', 'GET', null, { returnErrors: true }); },
    async getAppVersion() { return await apiFetch('/app-version'); },
  async getCompileTargets() { return await apiFetch('/compile/targets'); },
  async compilePreview(targets) { return await apiFetch('/compile/preview', 'POST', { targets }); },
  async compile(targets, outputDir) { return await apiFetch('/compile', 'POST', { targets, outputDir }); },
  async detectTools() { return await apiFetch('/tools/detect'); },
  async installGlobal(targets) { return await apiFetch('/tools/install-global', 'POST', { targets }); },
  async getWorkspaces() { return await apiFetch('/workspaces'); },
  async addWorkspace(wsPath, label) { return await apiFetch('/workspaces', 'POST', { action: 'add', path: wsPath, label }); },
  async removeWorkspace(wsPath) { return await apiFetch('/workspaces', 'POST', { action: 'remove', path: wsPath }); },
  async compileWorkspaces(targets, workspacePath) { return await apiFetch('/workspaces/compile', 'POST', { targets, workspacePath }); },
};

// ---- DEFAULT RULES (used for reset from data.js) ----
