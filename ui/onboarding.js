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
  /** @type {Array<{id: string, label: string, path: string, type: string, skillCount: number, imported?: boolean, lastSyncedAt?: string | null, aggregateStrategy?: string | null, fileCount?: number}>} */
  let skillSources = [];
  /** @type {Array<{path: string, label: string, exists: boolean, skillCount: number, alreadyLinked: boolean}>} */
  let skillCandidates = [];
  /** @type {string} */
  let customSourcePath = '';
  /** @type {string} */
  let sourceMessage = '';
  /** @type {string | null} */
  let expandedSourceId = null;
  /** @type {Map<string, {added: Array<{rel: string}>, removed: Array<{rel: string}>, modified: Array<{rel: string}>}>} */
  const pendingDiffs = new Map();
  /** @type {Map<string, 'import' | 'sync' | 'apply'>} */
  const pendingOp = new Map();
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
    await loadSkillSources();
    step = 1;
    mount();
    return true;
  }

  async function loadSkillSources() {
    try {
      const [sourcesResp, scanResp] = await Promise.all([DS.listSkillSources(), DS.scanSkillSources()]);
      skillSources = Array.isArray(sourcesResp?.sources) ? sourcesResp.sources : [];
      skillCandidates = Array.isArray(scanResp?.candidates) ? scanResp.candidates : [];
    } catch (err) {
      console.error('onboarding: skill source load failed', err);
      skillSources = [];
      skillCandidates = [];
    }
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
      ${renderSourcesSection()}
      ${
        indexReady
          ? ''
          : `<button class="fb onboarding-inline-action" type="button" onclick="Onboarding.buildIndex()">Build vector index</button>`
      }
    </section>`;
  }

  function renderSourcesSection() {
    const linked = skillSources.filter((s) => s.type !== 'internal');
    const candidates = skillCandidates.filter((c) => c.exists && !c.alreadyLinked && c.skillCount > 0);
    const messageHtml = sourceMessage
      ? `<div class="onboarding-source-message">${esc(sourceMessage)}</div>`
      : '';
    return `<div class="onboarding-sources">
      <div class="onboarding-sources-head">
        <span class="onboarding-card-name">Bring in existing skills</span>
        <span class="onboarding-card-desc">Link a folder of SKILL.md files from another tool — Context Engine reads them without copying or moving the originals.</span>
      </div>
      ${
        candidates.length
          ? `<div class="onboarding-source-list">${candidates.map(renderCandidateRow).join('')}</div>`
          : `<div class="onboarding-source-empty"><span class="onboarding-card-desc">No host-app skills folders detected. Paste a path below to link any folder of SKILL.md files.</span></div>`
      }
      <form class="onboarding-source-form" onsubmit="event.preventDefault(); Onboarding.linkCustom();">
        <input
          class="onboarding-source-input"
          type="text"
          placeholder="C:\\path\\to\\my\\skills"
          value="${esc(customSourcePath)}"
          oninput="Onboarding._setCustomPath(this.value)"
        />
        <button class="fb" type="submit">Link folder</button>
      </form>
      ${
        linked.length
          ? `<div class="onboarding-linked-head"><span class="onboarding-card-name">Linked</span></div>
             <div class="onboarding-source-list">${linked.map(renderLinkedRow).join('')}</div>`
          : ''
      }
      ${messageHtml}
    </div>`;
  }

  /** @param {{path: string, label: string, skillCount: number}} candidate */
  function renderCandidateRow(candidate) {
    const pathArg = candidate.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const labelArg = candidate.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="onboarding-source-row">
      <div class="onboarding-source-row-body">
        <span class="onboarding-card-name">${esc(candidate.label)}</span>
        <span class="onboarding-card-desc onboarding-source-path">${esc(candidate.path)}</span>
      </div>
      <div class="onboarding-source-row-meta">
        <span class="ct-badge">${esc(String(candidate.skillCount))} ${candidate.skillCount === 1 ? 'skill' : 'skills'}</span>
        <button class="fb" type="button" onclick="Onboarding.linkPath('${pathArg}', '${labelArg}')">Link</button>
      </div>
    </div>`;
  }

  /** @param {{id: string, label: string, path: string, skillCount: number, imported?: boolean, lastSyncedAt?: string | null, fileCount?: number}} source */
  function renderLinkedRow(source) {
    const isImported = !!source.imported;
    const isExpanded = expandedSourceId === source.id;
    const inFlight = pendingOp.get(source.id);
    const diff = pendingDiffs.get(source.id);

    const importedBadge = isImported
      ? `<span class="ct-badge">Imported${source.fileCount ? ` (${source.fileCount} files)` : ''}</span>`
      : '';

    const primaryAction = isImported
      ? `<button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="Onboarding.checkSourceChanges('${source.id}')">${inFlight === 'sync' ? 'Checking…' : 'Check for changes'}</button>`
      : `<button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="Onboarding.importSource('${source.id}')">${inFlight === 'import' ? 'Importing…' : 'Import to CE'}</button>`;

    return `<div class="onboarding-source-row linked ${isExpanded ? 'expanded' : ''}">
      <div class="onboarding-source-row-top">
        <div class="onboarding-source-row-body">
          <span class="onboarding-card-name">${esc(source.label)}</span>
          <span class="onboarding-card-desc onboarding-source-path">${esc(source.path)}</span>
        </div>
        <div class="onboarding-source-row-meta">
          ${importedBadge}
          <span class="ct-badge">${esc(String(source.skillCount || 0))} ${(source.skillCount || 0) === 1 ? 'skill' : 'skills'}</span>
          ${primaryAction}
          <button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="Onboarding.unlinkSource('${source.id}')">Unlink</button>
        </div>
      </div>
      ${isExpanded && diff ? renderDiffPanel(source.id, diff) : ''}
    </div>`;
  }

  /** @param {string} sourceId @param {{added: Array<{rel: string}>, removed: Array<{rel: string}>, modified: Array<{rel: string}>}} diff */
  function renderDiffPanel(sourceId, diff) {
    const inFlight = pendingOp.get(sourceId);
    const total = diff.added.length + diff.removed.length + diff.modified.length;
    if (total === 0) {
      return `<div class="onboarding-diff-panel">
        <span class="onboarding-card-desc">No changes detected. The imported tree matches the source.</span>
        <div class="onboarding-diff-actions">
          <button class="fb" type="button" onclick="Onboarding.closeDiff('${sourceId}')">Close</button>
        </div>
      </div>`;
    }
    return `<div class="onboarding-diff-panel">
      ${renderDiffList('Added', diff.added, 'added')}
      ${renderDiffList('Removed', diff.removed, 'removed')}
      ${renderDiffList('Modified', diff.modified, 'modified')}
      <div class="onboarding-diff-actions">
        <button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="Onboarding.closeDiff('${sourceId}')">Cancel</button>
        <button class="fb" type="button" ${inFlight || !diff.added.length ? 'disabled' : ''} onclick="Onboarding.applySync('${sourceId}', 'append')">${inFlight === 'apply' ? 'Applying…' : 'Append (add new only)'}</button>
        <button class="save-btn" type="button" ${inFlight ? 'disabled' : ''} onclick="Onboarding.applySync('${sourceId}', 'overwrite')">${inFlight === 'apply' ? 'Applying…' : 'Overwrite (mirror source)'}</button>
      </div>
    </div>`;
  }

  /** @param {string} label @param {Array<{rel: string}>} items @param {string} kind */
  function renderDiffList(label, items, kind) {
    if (!items.length) return '';
    return `<div class="onboarding-diff-group" data-kind="${kind}">
      <span class="onboarding-diff-label">${esc(label)} · ${items.length}</span>
      <ul class="onboarding-diff-files">
        ${items
          .slice(0, 8)
          .map((entry) => `<li>${esc(entry.rel)}</li>`)
          .join('')}
        ${items.length > 8 ? `<li class="onboarding-diff-more">+${items.length - 8} more</li>` : ''}
      </ul>
    </div>`;
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
    await loadSkillSources();
    render();
  }

  /** @param {string} sourcePath @param {string} [label] */
  async function linkPath(sourcePath, label) {
    sourceMessage = '';
    const result = await DS.addSkillSource({ path: sourcePath, label });
    if (result?.ok) {
      sourceMessage = `Linked ${result.source?.label || sourcePath}.`;
      if (typeof Toast !== 'undefined') Toast.success(sourceMessage);
      await refresh();
    } else {
      sourceMessage = result?.error || 'Could not link this folder.';
      render();
    }
  }

  async function linkCustom() {
    const trimmed = customSourcePath.trim();
    if (!trimmed) return;
    await linkPath(trimmed);
    customSourcePath = '';
  }

  /** @param {string} id */
  async function unlinkSource(id) {
    sourceMessage = '';
    const result = await DS.removeSkillSource(id);
    if (result?.ok) {
      sourceMessage = 'Source unlinked.';
      await refresh();
    } else {
      sourceMessage = result?.error || 'Could not unlink that source.';
      render();
    }
  }

  /** @param {string} value */
  function setCustomPath(value) {
    customSourcePath = value;
    // Do not re-render on every keystroke — input is uncontrolled-style.
  }

  /** @param {string} id */
  async function importSource(id) {
    sourceMessage = '';
    pendingOp.set(id, 'import');
    render();
    try {
      const result = await DS.importSkillSource(id);
      if (result?.ok) {
        const strategy = result.manifest?.aggregateStrategy || 'link';
        sourceMessage = `Imported. Files placed via ${strategy === 'link' ? 'hard link' : strategy === 'copy' ? 'copy' : 'link + copy'}.`;
        if (typeof Toast !== 'undefined') Toast.success('Source imported');
        await refresh();
      } else {
        sourceMessage = result?.error || 'Could not import this source.';
        render();
      }
    } finally {
      pendingOp.delete(id);
      render();
    }
  }

  /** @param {string} id */
  async function checkSourceChanges(id) {
    sourceMessage = '';
    pendingOp.set(id, 'sync');
    render();
    try {
      const result = await DS.syncSkillSource(id);
      if (result?.ok && result.diff) {
        pendingDiffs.set(id, result.diff);
        expandedSourceId = id;
      } else {
        sourceMessage = result?.error || 'Could not read source changes.';
      }
    } finally {
      pendingOp.delete(id);
      render();
    }
  }

  /** @param {string} id */
  function closeDiff(id) {
    pendingDiffs.delete(id);
    if (expandedSourceId === id) expandedSourceId = null;
    render();
  }

  /** @param {string} id @param {'append' | 'overwrite'} mode */
  async function applySync(id, mode) {
    pendingOp.set(id, 'apply');
    render();
    try {
      const result = await DS.applySkillSourceSync(id, mode);
      if (result?.ok) {
        const a = result.applied?.added || 0;
        const r = result.applied?.removed || 0;
        const m = result.applied?.modified || 0;
        sourceMessage = `Sync applied — ${a} added, ${r} removed, ${m} modified.`;
        pendingDiffs.delete(id);
        expandedSourceId = null;
        if (typeof Toast !== 'undefined') Toast.success('Source synced');
        await refresh();
      } else {
        sourceMessage = result?.error || 'Could not apply changes.';
        render();
      }
    } finally {
      pendingOp.delete(id);
      render();
    }
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
    linkPath,
    linkCustom,
    unlinkSource,
    importSource,
    checkSourceChanges,
    closeDiff,
    applySync,
    _setCustomPath: setCustomPath,
    _backdrop: onBackdrop,
  };
})();
