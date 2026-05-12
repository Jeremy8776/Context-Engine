// skill-sources-panel.js — Connections-tab inline panel for managing skill
// sources after onboarding. Mirrors the onboarding step-2 sources sub-section
// but renders into #skill-sources-panel rather than the onboarding modal, and
// stays mounted across navigation.

// @ts-check

const SkillSourcesPanel = (() => {
  /** @type {Array<{id: string, label: string, path: string, type: string, skillCount: number, imported?: boolean, lastSyncedAt?: string | null, fileCount?: number, aggregateStrategy?: string | null}>} */
  let sources = [];
  /** @type {Array<{path: string, label: string, exists: boolean, skillCount: number, alreadyLinked: boolean}>} */
  let candidates = [];
  let customPath = '';
  let message = '';
  /** @type {string | null} */
  let expandedId = null;
  /** @type {Map<string, {added: Array<{rel: string}>, removed: Array<{rel: string}>, modified: Array<{rel: string}>}>} */
  const diffs = new Map();
  /** @type {Map<string, 'import' | 'sync' | 'apply'>} */
  const ops = new Map();
  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;
    await refresh();
  }

  async function refresh() {
    try {
      const [sourcesResp, scanResp] = await Promise.all([DS.listSkillSources(), DS.scanSkillSources()]);
      sources = Array.isArray(sourcesResp?.sources) ? sourcesResp.sources : [];
      candidates = Array.isArray(scanResp?.candidates) ? scanResp.candidates : [];
    } catch (err) {
      console.error('skill-sources-panel: load failed', err);
    }
    render();
  }

  function render() {
    const host = document.getElementById('skill-sources-panel');
    if (!host) return;
    const linked = sources.filter((s) => s.type !== 'internal');
    const visible = candidates.filter((c) => c.exists && !c.alreadyLinked && c.skillCount > 0);
    host.innerHTML = `
      ${
        visible.length
          ? `<div class="ssp-list">${visible.map(renderCandidate).join('')}</div>`
          : `<div class="ssp-empty">No host-app skills folders detected on this machine. Paste a folder path below to link it.</div>`
      }
      <form class="ssp-form" onsubmit="event.preventDefault(); SkillSourcesPanel.linkCustom();">
        <input
          class="ssp-input"
          type="text"
          placeholder="C:\\path\\to\\my\\skills"
          value="${esc(customPath)}"
          oninput="SkillSourcesPanel._setPath(this.value)"
        />
        ${
          typeof window !== 'undefined' && window.contextEngineDesktop?.selectFolder
            ? '<button class="fb" type="button" onclick="SkillSourcesPanel.browse()">Browse…</button>'
            : ''
        }
        <button class="fb" type="submit">Link folder</button>
      </form>
      ${
        linked.length
          ? `<div class="ssp-linked-head"><span class="onboarding-card-name">Linked sources</span></div>
             <div class="ssp-list">${linked.map(renderLinked).join('')}</div>`
          : '<div class="ssp-linked-head"><span class="onboarding-card-name">No external sources linked yet</span></div>'
      }
      ${message ? `<div class="onboarding-source-message">${esc(message)}</div>` : ''}
    `;
  }

  /** @param {{path: string, label: string, skillCount: number}} candidate */
  function renderCandidate(candidate) {
    const pathArg = candidate.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const labelArg = candidate.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="onboarding-source-row">
      <div class="onboarding-source-row-top">
        <div class="onboarding-source-row-body">
          <span class="onboarding-card-name">${esc(candidate.label)}</span>
          <span class="onboarding-card-desc onboarding-source-path">${esc(candidate.path)}</span>
        </div>
        <div class="onboarding-source-row-meta">
          <span class="ct-badge">${esc(String(candidate.skillCount))} ${candidate.skillCount === 1 ? 'skill' : 'skills'}</span>
          <button class="fb" type="button" onclick="SkillSourcesPanel.linkPath('${pathArg}', '${labelArg}')">Link</button>
        </div>
      </div>
    </div>`;
  }

  /** @param {{id: string, label: string, path: string, skillCount: number, imported?: boolean, fileCount?: number, lastSyncedAt?: string | null}} source */
  function renderLinked(source) {
    const isImported = !!source.imported;
    const isExpanded = expandedId === source.id;
    const inFlight = ops.get(source.id);
    const diff = diffs.get(source.id);
    const importedBadge = isImported
      ? `<span class="ct-badge">Imported${source.fileCount ? ` (${source.fileCount} files)` : ''}</span>`
      : '';
    const primary = isImported
      ? `<button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="SkillSourcesPanel.check('${source.id}')">${inFlight === 'sync' ? 'Checking…' : 'Check for changes'}</button>`
      : `<button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="SkillSourcesPanel.import('${source.id}')">${inFlight === 'import' ? 'Importing…' : 'Import to CE'}</button>`;
    return `<div class="onboarding-source-row linked ${isExpanded ? 'expanded' : ''}">
      <div class="onboarding-source-row-top">
        <div class="onboarding-source-row-body">
          <span class="onboarding-card-name">${esc(source.label)}</span>
          <span class="onboarding-card-desc onboarding-source-path">${esc(source.path)}</span>
        </div>
        <div class="onboarding-source-row-meta">
          ${importedBadge}
          <span class="ct-badge">${esc(String(source.skillCount || 0))} ${(source.skillCount || 0) === 1 ? 'skill' : 'skills'}</span>
          ${primary}
          <button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="SkillSourcesPanel.unlink('${source.id}')">Unlink</button>
        </div>
      </div>
      ${isExpanded && diff ? renderDiff(source.id, diff) : ''}
    </div>`;
  }

  /** @param {string} sourceId @param {{added: Array<{rel: string}>, removed: Array<{rel: string}>, modified: Array<{rel: string}>}} diff */
  function renderDiff(sourceId, diff) {
    const inFlight = ops.get(sourceId);
    const total = diff.added.length + diff.removed.length + diff.modified.length;
    if (total === 0) {
      return `<div class="onboarding-diff-panel">
        <span class="onboarding-card-desc">No changes detected. The imported tree matches the source.</span>
        <div class="onboarding-diff-actions">
          <button class="fb" type="button" onclick="SkillSourcesPanel.closeDiff('${sourceId}')">Close</button>
        </div>
      </div>`;
    }
    return `<div class="onboarding-diff-panel">
      ${diffList('Added', diff.added, 'added')}
      ${diffList('Removed', diff.removed, 'removed')}
      ${diffList('Modified', diff.modified, 'modified')}
      <div class="onboarding-diff-actions">
        <button class="fb" type="button" ${inFlight ? 'disabled' : ''} onclick="SkillSourcesPanel.closeDiff('${sourceId}')">Cancel</button>
        <button class="fb" type="button" ${inFlight || !diff.added.length ? 'disabled' : ''} onclick="SkillSourcesPanel.apply('${sourceId}', 'append')">${inFlight === 'apply' ? 'Applying…' : 'Append (add new only)'}</button>
        <button class="save-btn" type="button" ${inFlight ? 'disabled' : ''} onclick="SkillSourcesPanel.apply('${sourceId}', 'overwrite')">${inFlight === 'apply' ? 'Applying…' : 'Overwrite (mirror source)'}</button>
      </div>
    </div>`;
  }

  /** @param {string} label @param {Array<{rel: string}>} items @param {string} kind */
  function diffList(label, items, kind) {
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

  /** @param {string} value */
  function setPath(value) {
    customPath = value;
  }

  /** @param {string} path @param {string} [label] */
  async function linkPath(path, label) {
    message = '';
    const result = await DS.addSkillSource({ path, label });
    if (result?.ok) {
      message = `Linked ${result.source?.label || path}.`;
      if (typeof Toast !== 'undefined') Toast.success(message);
      await refresh();
    } else {
      message = result?.error || 'Could not link this folder.';
      render();
    }
  }

  async function linkCustom() {
    const trimmed = customPath.trim();
    if (!trimmed) return;
    await linkPath(trimmed);
    customPath = '';
  }

  async function browse() {
    const picker = window.contextEngineDesktop?.selectFolder;
    if (!picker) return;
    try {
      const picked = await picker({ title: 'Pick a folder of SKILL.md files to link' });
      if (picked) await linkPath(picked);
    } catch (err) {
      console.error('skill-sources-panel: folder picker failed', err);
      message = 'Could not open folder picker.';
      render();
    }
  }

  /** @param {string} id */
  async function unlink(id) {
    message = '';
    const result = await DS.removeSkillSource(id);
    if (result?.ok) {
      message = 'Source unlinked.';
      diffs.delete(id);
      if (expandedId === id) expandedId = null;
      await refresh();
    } else {
      message = result?.error || 'Could not unlink that source.';
      render();
    }
  }

  /** @param {string} id */
  async function importSource(id) {
    message = '';
    ops.set(id, 'import');
    render();
    try {
      const result = await DS.importSkillSource(id);
      if (result?.ok) {
        const strategy = result.manifest?.aggregateStrategy || 'link';
        message = `Imported. Files placed via ${strategy === 'link' ? 'hard link' : strategy === 'copy' ? 'copy' : 'link + copy'}.`;
        if (typeof Toast !== 'undefined') Toast.success('Source imported');
        await refresh();
      } else {
        message = result?.error || 'Could not import this source.';
        render();
      }
    } finally {
      ops.delete(id);
      render();
    }
  }

  /** @param {string} id */
  async function check(id) {
    message = '';
    ops.set(id, 'sync');
    render();
    try {
      const result = await DS.syncSkillSource(id);
      if (result?.ok && result.diff) {
        diffs.set(id, result.diff);
        expandedId = id;
      } else {
        message = result?.error || 'Could not read source changes.';
      }
    } finally {
      ops.delete(id);
      render();
    }
  }

  /** @param {string} id */
  function closeDiff(id) {
    diffs.delete(id);
    if (expandedId === id) expandedId = null;
    render();
  }

  /** @param {string} id @param {'append' | 'overwrite'} mode */
  async function apply(id, mode) {
    ops.set(id, 'apply');
    render();
    try {
      const result = await DS.applySkillSourceSync(id, mode);
      if (result?.ok) {
        const a = result.applied?.added || 0;
        const r = result.applied?.removed || 0;
        const m = result.applied?.modified || 0;
        message = `Sync applied — ${a} added, ${r} removed, ${m} modified.`;
        diffs.delete(id);
        expandedId = null;
        if (typeof Toast !== 'undefined') Toast.success('Source synced');
        await refresh();
      } else {
        message = result?.error || 'Could not apply changes.';
        render();
      }
    } finally {
      ops.delete(id);
      render();
    }
  }

  return {
    init,
    refresh,
    linkPath,
    linkCustom,
    browse,
    unlink,
    import: importSource,
    check,
    closeDiff,
    apply,
    _setPath: setPath,
  };
})();
