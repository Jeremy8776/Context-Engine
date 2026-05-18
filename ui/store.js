// store.js — data layer + toast notifications for Context Engine v3

// @ts-check

const API = '/api';

/**
 * @typedef {{ label: string, onClick: () => void | Promise<void> }} ToastAction
 * @typedef {{ title?: string, message?: string, confirmText?: string, cancelText?: string, danger?: boolean }} ConfirmOptions
 * @typedef {{ returnErrors?: boolean }} ApiFetchOptions
 * @typedef {{ version?: string, last_updated?: string, entries: Array<string | { content?: string, [key: string]: unknown }> }} MemoryData
 * @typedef {{ coding: Object<string, string>, general: Object<string, string>, soul: Object<string, string>, [key: string]: unknown }} RulesData
 */

// ---- APP DIALOGS ----
const AppDialog = (() => {
  /** @type {HTMLDivElement | null} */
  let root = null;
  /** @type {((value: boolean) => void) | null} */
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
    root.querySelector('.app-dialog-close')?.addEventListener('click', () => settle(false));
    root.querySelector('.app-dialog-cancel')?.addEventListener('click', () => settle(false));
    root.querySelector('.app-dialog-confirm')?.addEventListener('click', () => settle(true));
    root.addEventListener('click', (e) => {
      if (e.target === root) settle(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root?.classList.contains('open')) settle(false);
    });
    return root;
  }

  /** @param {boolean} value */
  function settle(value) {
    ensure().classList.remove('open', 'danger');
    if (activeResolve) activeResolve(value);
    activeResolve = null;
  }

  /** @param {ConfirmOptions} [options] */
  function confirm(options = {}) {
    const el = ensure();
    const title = el.querySelector('#app-dialog-title');
    const message = el.querySelector('#app-dialog-message');
    const confirmButton = el.querySelector('.app-dialog-confirm');
    const cancelButton = el.querySelector('.app-dialog-cancel');
    if (title) title.textContent = options.title || 'Confirm action';
    if (message) message.textContent = options.message || 'Are you sure?';
    if (confirmButton) confirmButton.textContent = options.confirmText || 'Confirm';
    if (cancelButton) cancelButton.textContent = options.cancelText || 'Cancel';
    el.classList.toggle('danger', !!options.danger);
    el.classList.add('open');
    return new Promise((resolve) => {
      activeResolve = resolve;
      setTimeout(() => {
        /** @type {HTMLElement | null} */
        const focusBtn = el.querySelector('.app-dialog-confirm');
        focusBtn?.focus();
      }, 0);
    });
  }

  return { confirm };
})();

// ---- TOAST SYSTEM ----
const Toast = (() => {
  /** @type {HTMLDivElement | null} */
  let container = null;
  function init() {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  /**
   * @param {string} message
   * @param {'info' | 'success' | 'error' | 'warning'} [type]
   * @param {number} [duration]
   * @param {ToastAction | null} [action]
   */
  function show(message, type = 'info', duration = 3000, action = null) {
    if (!container) init();
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'OK' : type === 'error' ? '!' : type === 'warning' ? '!' : 'i';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message"></span>`;
    const messageEl = el.querySelector('.toast-message');
    if (messageEl) messageEl.textContent = message;
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
    /** @param {string} msg @param {number} [dur] */
    info: (msg, dur) => show(msg, 'info', dur),
    /** @param {string} msg @param {number} [dur] */
    success: (msg, dur) => show(msg, 'success', dur),
    /** @param {string} msg @param {number} [dur] */
    error: (msg, dur) => show(msg, 'error', dur || 5000),
    /** @param {string} msg @param {number} [dur] */
    warn: (msg, dur) => show(msg, 'warning', dur),
    /** @param {string} msg @param {string} label @param {() => void | Promise<void>} onClick */
    action: (msg, label, onClick) => show(msg, 'info', 0, { label, onClick }),
  };
})();
// ---- API FETCH ----
/**
 * @param {string} path
 * @param {string} [method]
 * @param {unknown} [payload]
 * @param {ApiFetchOptions} [options]
 * @returns {Promise<any>}
 */
async function apiFetch(path, method = 'GET', payload = null, options = {}) {
  try {
    /** @type {RequestInit} */
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (payload) opts.body = JSON.stringify(payload);
    const res = await fetch(`${API}${path}`, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (je) {
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
    Toast.error(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
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
  },
};
// ---- SKILL DATA (fetched from server) ----
let MEMORY_CATEGORIES = [];

async function loadSkillData() {
  const resp = await apiFetch('/skills');
  const data = resp && resp.skills ? resp.skills : resp;
  if (data && Array.isArray(data)) {
    SKILL_DATA = data;
    CATEGORIES = resp && resp.categories ? resp.categories : [];
  }
}

// ---- SKILL STATES ----
const SS = {
  /** @type {Record<string, boolean> | null} */
  _cache: null,
  get() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem('ce_ss');
      this._cache = raw ? JSON.parse(raw) || {} : {};
    } catch {
      this._cache = {};
    }
    return this._cache ?? {};
  },
  /** @param {string} id @param {boolean} v */
  set(id, v) {
    const s = this.get();
    s[id] = v;
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (ServerStatus.online) {
      apiFetch('/states', 'POST', {
        version: '1.0',
        last_updated: new Date().toISOString().split('T')[0],
        states: s,
      }).then((r) => {
        if (r && r.activeCount !== undefined) {
          Toast.success(`${r.activeCount} skills active`);
          if (typeof DashboardTab !== 'undefined') DashboardTab.refreshBudget();
        }
      });
    }
  },
  /** @param {string} id */
  active(id) {
    const s = this.get();
    if (id in s) return s[id];
    const sk = SKILL_DATA.find((x) => x.id === id);
    return sk ? sk.type !== 'external' : true;
  },
  async loadFromServer() {
    const data = await apiFetch('/states');
    if (data) {
      const states = data.states || data;
      // Backfill any skills the server knows about but are missing from
      // the saved states — they default to active so they stay visible.
      for (const skill of SKILL_DATA) {
        if (!(skill.id in states)) states[skill.id] = true;
      }
      this._cache = states;
      localStorage.setItem('ce_ss', JSON.stringify(states));
    }
  },
  /** @param {Record<string, boolean>} states */
  applyServerStates(states) {
    // Backfill any skills the UI knows about that are missing from server
    // states so they remain visible and default to active.
    for (const skill of SKILL_DATA) {
      if (!(skill.id in states)) states[skill.id] = true;
    }
    this._cache = states;
    localStorage.setItem('ce_ss', JSON.stringify(states));
  },
  /** @param {string[]} ids @param {string} keepId */
  async applyReview(ids, keepId) {
    const s = { ...this.get() };
    ids.forEach((id) => {
      s[id] = id === keepId;
    });
    return await this.saveStates(s);
  },
  /** @param {Array<{ ids: string[], keepId: string }>} choices */
  async applyReviewChoices(choices) {
    const s = { ...this.get() };
    choices.forEach(({ ids, keepId }) =>
      ids.forEach((id) => {
        s[id] = id === keepId;
      }),
    );
    return await this.saveStates(s);
  },
  /** @param {Record<string, boolean>} s */
  async saveStates(s) {
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (!ServerStatus.online) return { ok: true, localOnly: true };
    return await apiFetch(
      '/states',
      'POST',
      {
        version: '1.0',
        last_updated: new Date().toISOString().split('T')[0],
        states: s,
      },
      { returnErrors: true },
    );
  },
  /** @param {string[]} ids @param {boolean} value */
  setBulk(ids, value) {
    const s = this.get();
    ids.forEach((id) => {
      s[id] = value;
    });
    this._cache = s;
    localStorage.setItem('ce_ss', JSON.stringify(s));
    if (ServerStatus.online) {
      apiFetch('/states', 'POST', {
        version: '1.0',
        last_updated: new Date().toISOString().split('T')[0],
        states: s,
      }).then((r) => {
        if (r && r.activeCount !== undefined) {
          Toast.success(`${r.activeCount} skills active`);
          if (typeof DashboardTab !== 'undefined') DashboardTab.refreshBudget();
        }
      });
    }
  },
};
// ---- MEMORY ----
const MS = {
  /** @type {MemoryData | null} */
  _data: null,
  getData() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem('ce_mem_v2');
      if (raw) {
        this._data = JSON.parse(raw);
        return this._data;
      }
    } catch {}
    return { version: '1.1', entries: [] };
  },
  /** @param {MemoryData} memoryData */
  save(memoryData) {
    this._data = memoryData;
    memoryData.last_updated = new Date().toISOString().split('T')[0];
    localStorage.setItem('ce_mem_v2', JSON.stringify(memoryData));
    if (ServerStatus.online) {
      apiFetch('/memory', 'POST', memoryData).then((r) => {
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
  },
};

// ---- RULES ----
/** @type {Object<string, string[]>} */
const PRIORITY_SECTIONS = {
  coding: ['hard', 'soft'],
  general: ['hard', 'soft'],
  soul: ['soft'],
};

/** Migrate legacy flat-string rules to new priority-object format
 *  @param {any} rules
 *  @returns {RulesData}
 */
function migrateRules(rules) {
  if (!rules) return structuredClone(DEFAULT_RULES);
  /** @type {RulesData} */
  const result = { coding: {}, general: {}, soul: {} };
  for (const key of /** @type {('coding'|'general'|'soul')[]} */ (['coding', 'general', 'soul'])) {
    const section = rules[key];
    const priorities = /** @type {string[]} */ (PRIORITY_SECTIONS[key]);
    if (typeof section === 'string') {
      priorities.forEach((p) => {
        result[key][p] = p === 'soft' ? section : '';
      });
    } else if (section && typeof section === 'object') {
      priorities.forEach((p) => {
        if (p === 'soft') {
          const soft = typeof section.soft === 'string' ? section.soft : '';
          if (soft) {
            result[key][p] = soft;
          } else {
            const pref = typeof section.preference === 'string' ? section.preference : '';
            const style = typeof section.style === 'string' ? section.style : '';
            const parts = [];
            if (pref) parts.push('## Preference\n' + pref);
            if (style) parts.push('## Style\n' + style);
            result[key][p] = parts.join('\n\n');
          }
        } else {
          result[key][p] = typeof section[p] === 'string' ? section[p] : '';
        }
      });
    } else {
      priorities.forEach((p) => {
        result[key][p] = '';
      });
    }
  }
  return result;
}

const RS = {
  /** @type {RulesData | null} */
  _cache: null,
  get() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem('ce_rules');
      const s = raw ? JSON.parse(raw) : null;
      if (s) {
        this._cache = migrateRules(s);
        return this._cache;
      }
    } catch {}
    return structuredClone(DEFAULT_RULES);
  },
  /** @param {RulesData} rules */
  save(rules) {
    this._cache = rules;
    localStorage.setItem('ce_rules', JSON.stringify(rules));
    if (ServerStatus.online) {
      apiFetch('/rules', 'POST', {
        version: '1.0',
        last_updated: new Date().toISOString().split('T')[0],
        ...rules,
      }).then((r) => {
        if (r?.ok) Toast.success('Rules saved');
        else Toast.error('Failed to save rules');
      });
    }
  },
  async loadFromServer() {
    const data = await apiFetch('/rules');
    if (data) {
      const rules = migrateRules(data);
      this._cache = rules;
      localStorage.setItem('ce_rules', JSON.stringify(rules));
      return rules;
    }
    return null;
  },
};
// ---- DASHBOARD DATA ----
const DS = {
  async getHealth() {
    return await apiFetch('/health');
  },
  async getContextMd() {
    return await apiFetch('/context-md');
  },
  async regenContextMd() {
    return await apiFetch('/context-md', 'POST');
  },
  async getBudget() {
    return await apiFetch('/health');
  },
  async getBackups() {
    return await apiFetch('/backups');
  },
  async createBackup() {
    return await apiFetch('/backups', 'POST');
  },
  /** @param {string} ts */
  async restoreBackup(ts) {
    return await apiFetch('/restore', 'POST', { timestamp: ts });
  },
  async getSessionLog() {
    return await apiFetch('/session-log');
  },
  /** @param {unknown} e */
  async logSession(e) {
    return await apiFetch('/session-log', 'POST', e);
  },
  async getModes() {
    return await apiFetch('/modes');
  },
  /** @param {string} id */
  async applyMode(id) {
    return await apiFetch('/modes/apply', 'POST', { modeId: id });
  },
  /** @param {string} url */
  async ingestRepo(url) {
    return await apiFetch('/skills/ingest', 'POST', { url });
  },
  /** @param {string} jobId */
  async pollIngestJob(jobId) {
    return await apiFetch(`/skills/ingest/${jobId}`);
  },
  /** @param {Record<string, unknown>} [options] */
  async parseSkills(options = {}) {
    return await apiFetch('/skills/parse', 'POST', options, { returnErrors: true });
  },
  /** @param {boolean} [apply] */
  async organiseSkills(apply = true) {
    return await apiFetch('/skills/organise', 'POST', { apply });
  },
  /** @param {Record<string, unknown>} [options] */
  async reviewSimilarSkills(options = {}) {
    return await apiFetch('/skills/review-similar', 'POST', options, { returnErrors: true });
  },
  async getOllamaModels() {
    return await apiFetch('/llm/ollama-models', 'GET', null, { returnErrors: true });
  },
  async getAppVersion() {
    return await apiFetch('/app-version');
  },
  async getOnboarding() {
    return await apiFetch('/onboarding');
  },
  async completeOnboarding() {
    return await apiFetch('/onboarding/complete', 'POST', {});
  },
  async getIndexStatus() {
    return await apiFetch('/index/status');
  },
  async indexSkills() {
    return await apiFetch('/index', 'POST', {}, { returnErrors: true });
  },
  /** @param {string} query @param {number} [limit] */
  async searchIndex(query, limit = 10) {
    return await apiFetch('/search', 'POST', { query, limit }, { returnErrors: true });
  },
  /** @param {boolean} [refresh] */
  async getDedupReport(refresh = false) {
    return await apiFetch(`/dedup${refresh ? '?refresh=1' : ''}`, 'GET', null, { returnErrors: true });
  },
  /** @param {{ clusterId: string, action: string, keepSkillId?: string, note?: string }} input */
  async resolveDedupCluster(input) {
    return await apiFetch('/dedup/resolve', 'POST', input, { returnErrors: true });
  },
  /** @param {{ task: string, targets?: string[], maxTokens?: number, projectPath?: string }} input */
  async smartCompile(input) {
    return await apiFetch('/compile/smart', 'POST', input, { returnErrors: true });
  },
  async getMcpHosts() {
    return await apiFetch('/mcp/hosts');
  },
  /** @param {string} hostId */
  async installMcpHost(hostId) {
    return await apiFetch('/mcp/hosts/install', 'POST', { hostId }, { returnErrors: true });
  },
  async listSkillSources() {
    return await apiFetch('/skill-sources');
  },
  async scanSkillSources() {
    return await apiFetch('/skill-sources/scan');
  },
  /** @param {{ path: string, label?: string }} input */
  async addSkillSource(input) {
    return await apiFetch('/skill-sources', 'POST', input, { returnErrors: true });
  },
  /** @param {string} id */
  async removeSkillSource(id) {
    return await apiFetch(`/skill-sources/${encodeURIComponent(id)}`, 'DELETE', null, { returnErrors: true });
  },
  /** @param {string} id */
  async importSkillSource(id) {
    return await apiFetch(
      `/skill-sources/${encodeURIComponent(id)}/import`,
      'POST',
      {},
      { returnErrors: true },
    );
  },
  /** @param {string} id */
  async syncSkillSource(id) {
    return await apiFetch(`/skill-sources/${encodeURIComponent(id)}/sync`, 'GET', null, {
      returnErrors: true,
    });
  },
  /** @param {string} id @param {'append' | 'overwrite'} mode */
  async applySkillSourceSync(id, mode) {
    return await apiFetch(
      `/skill-sources/${encodeURIComponent(id)}/sync/apply`,
      'POST',
      { mode },
      { returnErrors: true },
    );
  },
  async getCompileTargets() {
    return await apiFetch('/compile/targets');
  },
  /** @param {string[]} targets */
  async compilePreview(targets) {
    return await apiFetch('/compile/preview', 'POST', { targets });
  },
  /** @param {string[]} targets @param {string | undefined} outputDir */
  async compile(targets, outputDir) {
    return await apiFetch('/compile', 'POST', { targets, outputDir });
  },
  async detectTools() {
    return await apiFetch('/tools/detect');
  },
  /** @param {string[]} targets */
  async installGlobal(targets) {
    return await apiFetch('/tools/install-global', 'POST', { targets });
  },
  async getWorkspaces() {
    return await apiFetch('/workspaces');
  },
  /** @param {string} wsPath @param {string} label */
  async addWorkspace(wsPath, label) {
    return await apiFetch('/workspaces', 'POST', { action: 'add', path: wsPath, label });
  },
  /** @param {string} wsPath */
  async removeWorkspace(wsPath) {
    return await apiFetch('/workspaces', 'POST', { action: 'remove', path: wsPath });
  },
  /** @param {string[]} targets @param {string | null} workspacePath */
  async compileWorkspaces(targets, workspacePath) {
    return await apiFetch('/workspaces/compile', 'POST', { targets, workspacePath });
  },
  async getProjects() {
    return await apiFetch('/projects');
  },
  /** @param {string} name @param {string} projectPath */
  async createProject(name, projectPath) {
    return await apiFetch('/projects', 'POST', { name, path: projectPath || '' });
  },
  /** @param {string} slug @param {Record<string, unknown>} patch */
  async updateProject(slug, patch) {
    return await apiFetch(`/projects/${encodeURIComponent(slug)}`, 'PATCH', patch);
  },
  /** @param {string} slug */
  async deleteProject(slug) {
    return await apiFetch(`/projects/${encodeURIComponent(slug)}`, 'DELETE');
  },
};

// ---- DEFAULT RULES (used for reset from data.js) ----
