// onboarding.js — First-run setup wizard, modal-based.
// Spec: docs/specs/onboarding-redesign.md
// @ts-check

const Onboarding = (() => {
  const STEPS = [
    { num: 1, label: 'Connect' },
    { num: 2, label: 'Context' },
    { num: 3, label: 'IDE' },
    { num: 4, label: 'Health' },
  ];

  /** @type {{ shouldShow?: boolean, hosts?: McpHostRecord[], tools?: any[], context?: any } | null} */
  let summary = null;
  /** @type {1 | 2 | 3 | 4} */
  let step = 1;
  /** @type {Set<string>} */
  let selectedHosts = new Set();
  let mounted = false;

  function root() {
    let el = document.getElementById('onboarding-root');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'onboarding-root';
    document.body.appendChild(el);
    return el;
  }

  async function init() {
    summary = await apiFetch('/onboarding');
    if (!summary?.shouldShow) return false;
    selectedHosts = new Set(
      (summary.hosts || [])
        .filter((host) => host.supported && (host.appDetected || host.status === 'connected'))
        .map((host) => host.id),
    );
    if (!selectedHosts.size) {
      (summary.hosts || []).filter((host) => host.supported).forEach((host) => selectedHosts.add(host.id));
    }
    step = 1;
    mount();
    return true;
  }

  function mount() {
    if (!mounted) {
      document.addEventListener('keydown', onKey);
      mounted = true;
    }
    render();
  }

  function close() {
    if (mounted) {
      document.removeEventListener('keydown', onKey);
      mounted = false;
    }
    const el = document.getElementById('onboarding-root');
    if (el) el.remove();
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') skip();
  }

  /** @param {MouseEvent} e */
  function onBackdrop(e) {
    if (e.target === e.currentTarget) skip();
  }

  function renderProgress() {
    const items = STEPS.map((s, idx) => {
      const state = s.num < step ? 'done' : s.num === step ? 'current' : 'upcoming';
      const connector =
        idx < STEPS.length - 1
          ? `<span class="onboarding-progress-bar ${s.num < step ? 'done' : ''}" aria-hidden="true"></span>`
          : '';
      return `
        <div class="onboarding-progress-step ${state}" aria-current="${state === 'current' ? 'step' : 'false'}">
          <span class="onboarding-progress-circle">${s.num}</span>
          <span class="onboarding-progress-label">${esc(s.label)}</span>
        </div>
        ${connector}
      `;
    }).join('');
    return `<nav class="onboarding-progress" aria-label="Setup progress">${items}</nav>`;
  }

  /** @param {McpHostRecord} host */
  function hostCard(host) {
    const checked = selectedHosts.has(host.id);
    const disabled = !host.supported;
    const status = CompileView.statusLabel(host.status);
    return `<label class="onboarding-host ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}">
      <input type="checkbox" class="onboarding-host-input" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="Onboarding.toggleHost('${host.id}', this.checked)" />
      <span class="onboarding-host-icon" aria-hidden="true">${esc(host.label.slice(0, 1))}</span>
      <span class="onboarding-host-body">
        <span class="onboarding-host-top">
          <strong class="onboarding-card-name">${esc(host.label)}</strong>
          <span class="ct-badge mcp-status-${host.status}">${esc(status)}</span>
        </span>
        <span class="onboarding-card-desc">${esc(host.summary)}</span>
      </span>
    </label>`;
  }

  function renderConnect() {
    const hosts = summary?.hosts || [];
    return `<section class="onboarding-step-body" data-step="1">
      <header class="onboarding-step-head">
        <h3>Connect your AI hosts</h3>
        <p>Pick the apps that should call Context Engine live. Selected hosts will be wired up in the next step. You can change this any time from Connections.</p>
      </header>
      <div class="onboarding-host-list">
        ${hosts.length ? hosts.map(hostCard).join('') : '<p class="onboarding-empty">No supported hosts detected on this machine yet.</p>'}
      </div>
    </section>`;
  }

  /**
   * @param {string} label
   * @param {string | number} value
   * @param {string} [hint]
   */
  function statCard(label, value, hint = '') {
    return `<article class="onboarding-stat">
      <span class="onboarding-card-name">${esc(label)}</span>
      <strong class="onboarding-stat-value">${esc(value)}</strong>
      ${hint ? `<span class="onboarding-card-desc">${esc(hint)}</span>` : ''}
    </article>`;
  }

  function renderContext() {
    const ctx = summary?.context || {};
    const index = ctx.index || {};
    const activeNames = ctx.activeSkillNames || [];
    const indexReady = !!index.ready;
    return `<section class="onboarding-step-body" data-step="2">
      <header class="onboarding-step-head">
        <h3>Available context</h3>
        <p>This is what host apps will be able to query through Context Engine. Build the vector index to enable semantic search.</p>
      </header>
      <div class="onboarding-stat-grid">
        ${statCard('Skills found', ctx.totalSkills || 0)}
        ${statCard('Active skills', ctx.activeSkills || 0)}
        ${statCard('Memory entries', ctx.memoryEntries || 0)}
        ${statCard('Vector index', indexReady ? 'Ready' : 'Empty', indexReady ? `${index.chunks || 0} chunks` : 'Build to enable search')}
      </div>
      <div class="onboarding-active-skills">
        <span class="onboarding-card-name">Active now</span>
        <span class="onboarding-card-desc">${esc(activeNames.length ? activeNames.join(', ') : 'No active skills yet')}</span>
      </div>
      ${
        indexReady
          ? ''
          : `<button class="fb onboarding-inline-action" type="button" onclick="Onboarding.buildIndex()">Build vector index</button>`
      }
    </section>`;
  }

  /** @param {any} tool */
  function surfaceCard(tool) {
    const tone = tool.detected ? 'detected' : tool.fileStandard ? 'file-standard' : 'available';
    const badge = tool.detected
      ? 'Detected'
      : tool.fileStandard
        ? 'File standard'
        : tool.available
          ? 'Available'
          : 'Not found';
    const detail = tool.signals?.length
      ? tool.signals.join(', ')
      : tool.globalReady
        ? 'Global fallback writable'
        : tool.projectReady
          ? 'Project fallback available'
          : 'Can be configured later';
    return `<article class="onboarding-surface ${tone}">
      <span class="onboarding-surface-icon" aria-hidden="true">${esc(String(tool.label || tool.id).slice(0, 1))}</span>
      <span class="onboarding-surface-body">
        <span class="onboarding-surface-top">
          <strong class="onboarding-card-name">${esc(tool.label || tool.id)}</strong>
          <span class="ct-badge">${esc(badge)}</span>
        </span>
        <span class="onboarding-card-desc onboarding-surface-detail">${esc(detail)}</span>
      </span>
    </article>`;
  }

  function renderIde() {
    const tools = summary?.tools || [];
    const visible = tools.filter((tool) => tool.detected || tool.available || tool.fileStandard).slice(0, 8);
    return `<section class="onboarding-step-body" data-step="3">
      <header class="onboarding-step-head">
        <h3>IDE and file-output surfaces</h3>
        <p>Tools that don't call Context Engine through MCP can still receive compiled instruction files. CE can write to these as a fallback.</p>
      </header>
      ${
        visible.length
          ? `<div class="onboarding-surface-grid">${visible.map(surfaceCard).join('')}</div>`
          : `<div class="onboarding-empty">
              <strong class="onboarding-card-name">No IDE surfaces detected yet</strong>
              <span class="onboarding-card-desc">Context Engine can still create AGENTS.md and other project files once you add a workspace.</span>
            </div>`
      }
    </section>`;
  }

  /**
   * @param {string} label
   * @param {boolean} ready
   * @param {string} detail
   */
  function healthCard(label, ready, detail) {
    return `<article class="onboarding-health ${ready ? 'ready' : 'pending'}">
      <span class="onboarding-card-name">${esc(label)}</span>
      <strong class="onboarding-health-value">${esc(ready ? 'Ready' : 'Needs setup')}</strong>
      <span class="onboarding-card-desc">${esc(detail)}</span>
    </article>`;
  }

  function renderHealth() {
    const ctx = summary?.context || {};
    const index = ctx.index || {};
    const connected = (summary?.hosts || []).filter((host) => host.status === 'connected').length;
    const indexReady = !!index.ready;
    return `<section class="onboarding-step-body" data-step="4">
      <header class="onboarding-step-head">
        <h3>Final health check</h3>
        <p>Confirm Context Engine has something useful to serve before you start using it from a host app.</p>
      </header>
      <div class="onboarding-health-grid">
        ${healthCard('Host connections', connected > 0, connected > 0 ? `${connected} connected` : 'Connect at least one host')}
        ${healthCard('Active skills', (ctx.activeSkills || 0) > 0, `${ctx.activeSkills || 0} active`)}
        ${healthCard('Vector search', indexReady, indexReady ? `${index.chunks || 0} chunks` : 'Build recommended')}
      </div>
      ${
        indexReady
          ? ''
          : `<button class="fb onboarding-inline-action" type="button" onclick="Onboarding.buildIndex()">Build vector index</button>`
      }
    </section>`;
  }

  function renderBody() {
    if (step === 1) return renderConnect();
    if (step === 2) return renderContext();
    if (step === 3) return renderIde();
    return renderHealth();
  }

  function renderFooter() {
    const isFirst = step === 1;
    const isLast = step === 4;
    const next = isLast ? 'Finish setup' : 'Continue';
    const nextAction = isLast ? 'finish' : `go(${step + 1})`;
    return `<footer class="onboarding-footer">
      <button class="fb" type="button" onclick="Onboarding.skip()">Skip for now</button>
      <div class="onboarding-footer-end">
        ${isFirst ? '' : `<button class="fb" type="button" onclick="Onboarding.go(${step - 1})">Back</button>`}
        <button class="save-btn" type="button" onclick="Onboarding.${nextAction}">${esc(next)}</button>
      </div>
    </footer>`;
  }

  function render() {
    root().innerHTML = `<div class="onboarding-overlay" onclick="Onboarding._backdrop(event)" role="presentation">
      <div class="onboarding-dialog app-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header class="onboarding-header">
          <img class="onboarding-brand-icon" src="assets/brand/icon-simple.svg" alt="" width="28" height="28" />
          <div class="onboarding-header-text">
            <h2 id="onboarding-title">Welcome to Context Engine</h2>
            <p>One-time setup. Everything is changeable later.</p>
          </div>
          <button class="onboarding-close" type="button" aria-label="Close setup" onclick="Onboarding.skip()">×</button>
        </header>
        ${renderProgress()}
        <main class="onboarding-body">${renderBody()}</main>
        ${renderFooter()}
      </div>
    </div>`;
  }

  /** @param {1 | 2 | 3 | 4} next */
  function go(next) {
    step = next;
    render();
    const dialog = document.querySelector('.onboarding-dialog');
    if (dialog instanceof HTMLElement) dialog.scrollTo(0, 0);
  }

  /** @param {string} hostId @param {boolean} selected */
  function toggleHost(hostId, selected) {
    if (selected) selectedHosts.add(hostId);
    else selectedHosts.delete(hostId);
    render();
  }

  async function refresh() {
    summary = await apiFetch('/onboarding');
    render();
  }

  /** @param {string} hostId */
  async function connectHost(hostId) {
    const result = await DS.installMcpHost(hostId);
    if (result?.ok) Toast.success('Host config updated');
    await refresh();
  }

  async function buildIndex() {
    const result = await DS.indexSkills();
    if (result?.ok) Toast.success(`Indexed ${result.chunks || 0} chunks`);
    await refresh();
  }

  async function finish() {
    // Apply pending host connections that the user selected but hasn't manually
    // wired. Best-effort — failures surface as toasts, but don't block finish.
    const pending = (summary?.hosts || []).filter(
      (host) => host.supported && selectedHosts.has(host.id) && host.status !== 'connected',
    );
    for (const host of pending) {
      try {
        await DS.installMcpHost(host.id);
      } catch (err) {
        console.error('onboarding: install host failed', host.id, err);
      }
    }
    const result = await apiFetch('/onboarding/complete', 'POST', {});
    if (result?.ok) {
      close();
      Toast.success('Setup complete');
      if (typeof DashboardTab !== 'undefined') await DashboardTab.init();
    }
  }

  async function skip() {
    const result = await apiFetch('/onboarding/complete', 'POST', {});
    if (result?.ok) close();
  }

  return {
    init,
    go,
    toggleHost,
    connectHost,
    buildIndex,
    finish,
    skip,
    _backdrop: onBackdrop,
  };
})();
