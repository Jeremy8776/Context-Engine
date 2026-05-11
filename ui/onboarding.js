// onboarding.js -- First-run discovery, connection, and health flow.

// @ts-check

const Onboarding = (() => {
  /** @type {{ shouldShow?: boolean, hosts?: McpHostRecord[], tools?: any[], context?: any } | null} */
  let summary = null;
  /** @type {'discover' | 'connect' | 'health'} */
  let step = 'discover';
  /** @type {Set<string>} */
  let selectedHosts = new Set();

  function root() {
    let el = document.getElementById('onboarding-root');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'onboarding-root';
    el.className = 'onboarding-root';
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
    render();
    document.body.classList.add('onboarding-active');
    return true;
  }

  function close() {
    document.body.classList.remove('onboarding-active');
    const el = document.getElementById('onboarding-root');
    if (el) el.remove();
  }

  function steps() {
    return [
      { id: 'discover', label: 'Discover' },
      { id: 'connect', label: 'Connect' },
      { id: 'health', label: 'Health' },
    ];
  }

  function progress() {
    return `<aside class="onboarding-rail">
      <div class="onboarding-brand">
        <span class="onboarding-mark">CE</span>
        <strong>Context Engine</strong>
      </div>
      <div class="onboarding-steps">
        ${steps()
          .map(
            (
              item,
              index,
            ) => `<button class="onboarding-step ${item.id === step ? 'active' : ''}" onclick="Onboarding.go('${item.id}')">
              <span>${index + 1}</span>
              <strong>${item.label}</strong>
            </button>`,
          )
          .join('')}
      </div>
    </aside>`;
  }

  function contextCards() {
    const ctx = summary?.context || {};
    const index = ctx.index || {};
    return `<div class="onboarding-context-grid">
      ${metric('Skills found', ctx.totalSkills || 0)}
      ${metric('Active skills', ctx.activeSkills || 0)}
      ${metric('Memory entries', ctx.memoryEntries || 0)}
      ${metric('Vector index', index.ready ? 'Ready' : 'Empty', index.ready ? `${index.chunks || 0} chunks` : 'Build on Health')}
    </div>`;
  }

  /**
   * @param {string} label
   * @param {string | number} value
   * @param {string} [detail]
   */
  function metric(label, value, detail = '') {
    return `<div class="onboarding-metric">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      ${detail ? `<small>${esc(detail)}</small>` : ''}
    </div>`;
  }

  /** @param {McpHostRecord} host */
  function hostCard(host) {
    const checked = selectedHosts.has(host.id);
    const disabled = !host.supported;
    const status = CompileView.statusLabel(host.status);
    return `<label class="onboarding-host ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}">
      <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="Onboarding.toggleHost('${host.id}', this.checked)" />
      <span class="onboarding-host-icon">${esc(host.label.slice(0, 1))}</span>
      <span class="onboarding-host-body">
        <span class="onboarding-host-top">
          <strong>${esc(host.label)}</strong>
          <span class="ct-badge mcp-status-${host.status}">${esc(status)}</span>
        </span>
        <span>${esc(host.summary)}</span>
      </span>
    </label>`;
  }

  /** @param {any} tool */
  function surfaceCard(tool) {
    const tone = tool.detected ? 'detected' : tool.available ? 'available' : 'quiet';
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
      <div class="onboarding-surface-icon">${esc(String(tool.label || tool.id).slice(0, 1))}</div>
      <div>
        <div class="onboarding-surface-top">
          <strong>${esc(tool.label || tool.id)}</strong>
          <span>${esc(badge)}</span>
        </div>
        <p>${esc(detail)}</p>
      </div>
    </article>`;
  }

  function renderDetectedSurfaces() {
    const tools = summary?.tools || [];
    const visible = tools.filter((tool) => tool.detected || tool.available || tool.fileStandard).slice(0, 8);
    if (!visible.length) {
      return `<div class="onboarding-empty-scan">
        <strong>No IDE surfaces detected yet</strong>
        <span>CE can still create AGENTS.md and other project files once you add a workspace.</span>
      </div>`;
    }
    return `<div class="onboarding-surface-grid">${visible.map(surfaceCard).join('')}</div>`;
  }

  function renderDiscover() {
    const activeNames = summary?.context?.activeSkillNames || [];
    return `<div class="onboarding-panel">
      <span class="compile-kicker">Welcome</span>
      <h1>Context Engine found your working setup</h1>
      <p class="onboarding-lede">It can connect to the AI apps you already use and serve your selected skills, memory, and indexed context when those apps ask for help.</p>
      <div class="onboarding-hero-band">
        <div>
          <span>Scan result</span>
          <strong>${esc((summary?.hosts || []).filter((host) => host.appDetected || host.status === 'connected').length)} host signals / ${esc((summary?.tools || []).filter((tool) => tool.detected || tool.available).length)} app surfaces</strong>
        </div>
        <div>
          <span>Best next step</span>
          <strong>Connect one runtime host, then verify search health.</strong>
        </div>
      </div>
      <div class="onboarding-split">
        <section>
          <div class="onboarding-section-head">
            <strong>Runtime hosts</strong>
            <span>Apps that can call CE live through MCP.</span>
          </div>
          <div class="onboarding-host-list">${(summary?.hosts || []).map(hostCard).join('')}</div>
        </section>
        <section>
          <div class="onboarding-section-head">
            <strong>Available context</strong>
            <span>What host apps can query.</span>
          </div>
          ${contextCards()}
          <div class="onboarding-active-skills">
            <span>Active now</span>
            <strong>${esc(activeNames.length ? activeNames.join(', ') : 'No active skills yet')}</strong>
          </div>
        </section>
      </div>
      <section class="onboarding-surfaces-section">
        <div class="onboarding-section-head">
          <strong>IDE and file-output surfaces</strong>
          <span>These are fallback targets CE can write for tools that do not call MCP live.</span>
        </div>
        ${renderDetectedSurfaces()}
      </section>
      <div class="onboarding-actions">
        <button class="fb" onclick="Onboarding.skip()">Skip for now</button>
        <button class="save-btn" onclick="Onboarding.go('connect')">Connect selected apps</button>
      </div>
    </div>`;
  }

  /** @param {McpHostRecord} host */
  function connectCard(host) {
    const connected = host.status === 'connected';
    const selected = selectedHosts.has(host.id);
    return `<article class="onboarding-connect-card ${selected ? '' : 'muted'}">
      <div>
        <span class="compile-kicker">${esc(host.mode === 'remote-http' ? 'Remote connector' : 'Local MCP')}</span>
        <h3>${esc(host.label)}</h3>
        <p>${esc(host.note || host.summary)}</p>
      </div>
      <div class="onboarding-connect-status">
        <span class="ct-badge mcp-status-${host.status}">${esc(CompileView.statusLabel(host.status))}</span>
        ${connected ? '<span class="onboarding-ok">Config present</span>' : ''}
      </div>
      <div class="onboarding-connect-actions">
        ${
          host.supported
            ? `<button class="save-btn small" ${selected ? '' : 'disabled'} onclick="Onboarding.connectHost('${host.id}')">${connected ? 'Re-apply' : 'Connect'}</button>`
            : `<button class="fb small" onclick="switchTabByName('compile')">Open setup later</button>`
        }
      </div>
    </article>`;
  }

  function renderConnect() {
    return `<div class="onboarding-panel">
      <span class="compile-kicker">Connect</span>
      <h1>Wire CE into the selected hosts</h1>
      <p class="onboarding-lede">Context Engine only writes its own MCP block and keeps existing host configuration intact.</p>
      <div class="onboarding-connect-grid">${(summary?.hosts || []).map(connectCard).join('')}</div>
      <div class="onboarding-actions">
        <button class="fb" onclick="Onboarding.go('discover')">Back</button>
        <button class="save-btn" onclick="Onboarding.go('health')">Continue to health</button>
      </div>
    </div>`;
  }

  function renderHealth() {
    const ctx = summary?.context || {};
    const index = ctx.index || {};
    const connected = (summary?.hosts || []).filter((host) => host.status === 'connected').length;
    return `<div class="onboarding-panel">
      <span class="compile-kicker">Health</span>
      <h1>Prove the bridge has useful context</h1>
      <p class="onboarding-lede">This is the final check before you start using CE from Claude, Codex, or another host app.</p>
      <div class="onboarding-health-grid">
        ${healthItem('Host connections', connected ? 'Ready' : 'Needs setup', `${connected} connected`)}
        ${healthItem('Active skills', ctx.activeSkills > 0 ? 'Ready' : 'Needs skills', `${ctx.activeSkills || 0} active`)}
        ${healthItem('Vector search', index.ready ? 'Ready' : 'Empty', index.ready ? `${index.chunks || 0} chunks` : 'Build recommended')}
      </div>
      <div class="onboarding-actions">
        <button class="fb" onclick="Onboarding.go('connect')">Back</button>
        <button class="fb" onclick="Onboarding.buildIndex()">Build index</button>
        <button class="save-btn" onclick="Onboarding.finish()">Finish setup</button>
      </div>
    </div>`;
  }

  /**
   * @param {string} label
   * @param {string | number} value
   * @param {string | undefined} detail
   */
  function healthItem(label, value, detail) {
    return `<div class="onboarding-health-card">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(detail)}</small>
    </div>`;
  }

  function render() {
    root().innerHTML = `<div class="onboarding-shell">
      ${progress()}
      <main class="onboarding-main">
        ${step === 'discover' ? renderDiscover() : step === 'connect' ? renderConnect() : renderHealth()}
      </main>
    </div>`;
  }

  /** @param {'discover' | 'connect' | 'health'} next */
  function go(next) {
    step = next;
    render();
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
    const result = await apiFetch('/onboarding/complete', 'POST', {});
    if (result?.ok) {
      close();
      Toast.success('Setup complete');
      if (typeof DashboardTab !== 'undefined') await DashboardTab.init();
    }
  }

  async function skip() {
    await finish();
  }

  return {
    init,
    go,
    toggleHost,
    connectHost,
    buildIndex,
    finish,
    skip,
  };
})();
