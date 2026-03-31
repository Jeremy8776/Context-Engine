// store.js — data layer + toast notifications for Context Engine v3

const API = '/api';

// ---- TOAST SYSTEM ----
const Toast = (() => {
  let container;
  function init() {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  function show(message, type = 'info', duration = 3000) {
    if (!container) init();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  return {
    info:    (msg, dur) => show(msg, 'info', dur),
    success: (msg, dur) => show(msg, 'success', dur),
    error:   (msg, dur) => show(msg, 'error', dur || 5000),
    warn:    (msg, dur) => show(msg, 'warning', dur),
  };
})();
// ---- API FETCH ----
async function apiFetch(path, method = 'GET', payload = null) {
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
      return null;
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
  async parseSkills() { return await apiFetch('/skills/parse', 'POST'); },
  async getCompileTargets() { return await apiFetch('/compile/targets'); },
  async compilePreview(targets) { return await apiFetch('/compile/preview', 'POST', { targets }); },
  async compile(targets) { return await apiFetch('/compile', 'POST', { targets }); },
  async detectTools() { return await apiFetch('/tools/detect'); },
  async installGlobal(targets) { return await apiFetch('/tools/install-global', 'POST', { targets }); },
  async getWorkspaces() { return await apiFetch('/workspaces'); },
  async addWorkspace(wsPath, label) { return await apiFetch('/workspaces', 'POST', { action: 'add', path: wsPath, label }); },
  async removeWorkspace(wsPath) { return await apiFetch('/workspaces', 'POST', { action: 'remove', path: wsPath }); },
  async compileWorkspaces(targets, workspacePath) { return await apiFetch('/workspaces/compile', 'POST', { targets, workspacePath }); },
};

// ---- DEFAULT RULES (used for reset from data.js) ----