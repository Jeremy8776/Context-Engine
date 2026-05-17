// @ts-nocheck - renderer globals are declared in ui/types.d.ts.

const HandoffsTab = (() => {
  let active = [];
  let archived = [];
  let view = 'active';
  let layout = 'grid'; // 'grid' | 'list' — mirrors Skills + Memory tabs
  let query = '';
  let selected = '';
  let initialized = false;
  let loaded = false;

  function currentItems() {
    const q = query.trim().toLowerCase();
    const source = view === 'archive' ? archived : active;
    return source.filter((item) => {
      const haystack = `${item.title || ''} ${item.body || ''} ${item.repo || ''} ${item.thread_tag || ''}`;
      return !q || haystack.toLowerCase().includes(q);
    });
  }

  async function load() {
    const [activeResp, archivedResp] = await Promise.all([
      apiFetch('/handoffs'),
      apiFetch('/handoffs/archive'),
    ]);
    active = Array.isArray(activeResp?.handoffs) ? activeResp.handoffs : [];
    archived = Array.isArray(archivedResp?.handoffs) ? archivedResp.handoffs : [];
    loaded = !!activeResp || !!archivedResp;
    render();
  }

  function render() {
    updateToggle();
    renderStats();
    const host = document.getElementById('handoffs-list');
    if (!host) return;
    const items = currentItems();
    if (!items.length) {
      host.innerHTML = `
        <div class="handoffs-workbench">
          <section class="handoffs-results"><div class="db-empty">No handoffs match this view.</div></section>
        </div>`;
      return;
    }
    if (!items.some((item) => item.slug === selected)) selected = items[0].slug;
    host.innerHTML = `
      <div class="handoffs-workbench">
        <section class="handoffs-results">
          <div class="handoffs-results-scroll handoffs-layout-${esc(layout)}">
            ${items.map(renderCard).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderCard(item) {
    const isActive = item.slug === selected ? ' active' : '';
    // Project-bound handoffs surface the project name (basename of the repo
    // path) as a prominent badge so a user scanning the list can tell
    // "context-engine" handoffs apart from "comfyui-deploy" handoffs at a
    // glance instead of squinting at the trailing two path segments.
    const projectName = item.repo ? esc(projectTitle(item.repo)) : '';
    const projectBadge = projectName
      ? `<span class="handoff-project-badge" title="${esc(item.repo)}">${projectName}</span>`
      : '';
    // Meta info (binding, age, optional commit count) used to render as a
    // row of three pill chips below the preview. At list-view density the
    // pill chrome read as visual noise and the small mono text inside each
    // chip lost legibility. Following Memory's pattern: render title + a
    // single preview line. Meta becomes a thin subtitle prefix on the
    // preview, plain text, no chrome.
    const commits = item.staleness?.commits_past_head;
    const commitLabel =
      typeof commits === 'number' ? `${commits} commit${commits === 1 ? '' : 's'} past head` : '';
    const subtitle = [bindingLabel(item), ageLabel(item.last_touched), commitLabel]
      .filter(Boolean)
      .join(' · ');
    const previewText = preview(item.body);
    return `
      <button class="handoff-card${isActive}" onclick="HandoffsTab.select('${esc(item.slug)}')">
        <span class="handoff-card-top">
          <span class="handoff-title-row">
            ${projectBadge}
            <span class="handoff-title">${esc(item.title || item.slug)}</span>
          </span>
          <span class="handoff-type">${esc(typeLabel(item.type))}</span>
        </span>
        <span class="handoff-subtitle">${esc(subtitle)}</span>
        ${previewText ? `<span class="handoff-preview">${esc(previewText)}</span>` : ''}
      </button>`;
  }

  function select(slug) {
    selected = slug;
    const item = currentItems().find((candidate) => candidate.slug === slug);
    render();
    if (!item) return;
    SidePanel.open(
      item.title || item.slug,
      view === 'archive' ? renderArchivedDetail(item) : renderActiveDetail(item),
    );
  }

  function renderActiveDetail(item) {
    return `
      <div class="sp-detail">
        <div class="handoff-detail-meta">
          <span>${esc(typeLabel(item.type))}</span>
          <span>${esc(bindingLabel(item))}</span>
          <span>${esc(ageLabel(item.last_touched))}</span>
        </div>
        ${renderCommitTimeline(item)}
        <div class="sp-field">
          <label>Title</label>
          <input class="add-input" id="handoff-edit-title" value="${esc(item.title || '')}" />
        </div>
        <div class="sp-field">
          <label>Body</label>
          <textarea
            class="add-input handoff-edit-body"
            id="handoff-edit-body"
            rows="10"
            placeholder="Where you are, what's next, anchors and references."
          >${esc(item.body || '')}</textarea>
        </div>
        ${renderHandoffTimeline(item)}
        <div class="sp-actions sp-actions-edit compact">
          <button class="save-btn" onclick="HandoffsTab.save('${esc(item.slug)}')">Save</button>
          <button class="save-btn ghost" onclick="SidePanel.close()">Cancel</button>
          <button class="mem-btn danger push-end" onclick="HandoffsTab.archive('${esc(item.slug)}')">Archive</button>
        </div>
      </div>`;
  }

  function renderArchivedDetail(item) {
    return `
      <div class="sp-detail">
        <div class="handoff-detail-meta">
          <span>${esc(typeLabel(item.type))}</span>
          <span>${esc(bindingLabel(item))}</span>
          <span>${esc(item.archived ? `Archived ${ageLabel(item.archived)}` : 'Archived')}</span>
        </div>
        ${renderCommitTimeline(item)}
        ${renderHandoffTimeline(item)}
        <div class="sp-actions sp-actions-edit compact">
          <button class="save-btn" onclick="HandoffsTab.restore('${esc(item.slug)}')">Restore</button>
          <button class="mem-btn danger push-end" onclick="HandoffsTab.purge('${esc(item.slug)}')">Purge</button>
        </div>
      </div>`;
  }

  async function save(slug) {
    const title = /** @type {HTMLInputElement|null} */ (
      document.getElementById('handoff-edit-title')
    )?.value.trim();
    if (!title) return Toast.error('Title is required');
    // Body is optional; pass through even when empty so users can clear it.
    const body =
      /** @type {HTMLTextAreaElement|null} */ (document.getElementById('handoff-edit-body'))?.value ??
      undefined;
    const patch = { title };
    if (body !== undefined) patch.body = body;
    const result = await apiFetch(`/handoffs/${encodeURIComponent(slug)}`, 'PATCH', patch);
    if (!result?.ok) return;
    Toast.success('Handoff saved');
    await load();
    select(slug);
  }

  async function archive(slug) {
    const ok = await AppDialog.confirm({
      title: 'Archive handoff',
      message: 'This moves the handoff out of the active resume list.',
      confirmText: 'Archive',
    });
    if (!ok) return;
    const result = await apiFetch(`/handoffs/${encodeURIComponent(slug)}/archive`, 'POST', {});
    if (!result?.ok) return;
    SidePanel.close();
    selected = '';
    Toast.success('Handoff archived');
    await load();
  }

  async function restore(slug) {
    const result = await apiFetch(`/handoffs/${encodeURIComponent(slug)}/restore`, 'POST', {});
    if (!result?.ok) return;
    view = 'active';
    selected = slug;
    SidePanel.close();
    Toast.success('Handoff restored');
    await load();
  }

  async function purge(slug) {
    const ok = await AppDialog.confirm({
      title: 'Purge handoff',
      message: 'This permanently deletes the archived handoff.',
      confirmText: 'Purge',
      danger: true,
    });
    if (!ok) return;
    const result = await apiFetch(`/handoffs/${encodeURIComponent(slug)}/purge`, 'POST', {});
    if (!result?.ok) return;
    SidePanel.close();
    selected = '';
    Toast.success('Handoff purged');
    await load();
  }

  function setView(next) {
    view = next === 'archive' ? 'archive' : 'active';
    selected = '';
    SidePanel.close();
    render();
  }

  function setLayout(next) {
    layout = next === 'list' ? 'list' : 'grid';
    document.getElementById('handoffs-btn-grid')?.classList.toggle('on', layout === 'grid');
    document.getElementById('handoffs-btn-list')?.classList.toggle('on', layout === 'list');
    render();
  }

  function updateToggle() {
    // Toolbar now carries the layout toggle; the active/archive pills live
    // inside renderStats. Sync the layout pills here so a re-render after
    // load picks up the right ".on" class.
    document.getElementById('handoffs-btn-grid')?.classList.toggle('on', layout === 'grid');
    document.getElementById('handoffs-btn-list')?.classList.toggle('on', layout === 'list');
  }

  function renderStats() {
    const host = document.getElementById('handoffs-stats');
    if (!host) return;
    const visible = currentItems().length;
    host.innerHTML = `
      <div class="handoffs-stats-row">
        <div class="handoffs-filter-pills" role="group" aria-label="Filter">
          <button
            class="handoff-filter-pill ${view === 'active' ? 'on' : ''}"
            type="button"
            onclick="HandoffsTab.setView('active')"
          >Active <span class="handoff-filter-count">${active.length}</span></button>
          <button
            class="handoff-filter-pill ${view === 'archive' ? 'on' : ''}"
            type="button"
            onclick="HandoffsTab.setView('archive')"
          >Archived <span class="handoff-filter-count">${archived.length}</span></button>
        </div>
        <span class="handoffs-stats-visible"><b>${visible}</b> visible</span>
      </div>`;
  }

  function renderCommitTimeline(item) {
    if (!item.repo || !item.head_sha) return '';
    const commits = Array.isArray(item.staleness?.commit_timeline) ? item.staleness.commit_timeline : [];
    const count = item.staleness?.commits_past_head;
    const countLabel =
      count === null || count === undefined ? 'No git signal' : `${count} commits past handoff`;
    return `
      <section class="handoff-commit-section">
        <div class="handoff-section-head">
          <span>Commit timeline</span>
          <span>${esc(countLabel)}</span>
        </div>
        ${
          commits.length
            ? `<div class="handoff-commit-list">${commits.map(renderCommit).join('')}</div>`
            : '<div class="handoff-commit-empty">No commits past the recorded handoff head.</div>'
        }
      </section>`;
  }

  function renderCommit(commit) {
    return `
      <div class="handoff-commit-item">
        <span class="handoff-commit-sha">${esc(commit.short_sha || '')}</span>
        <span class="handoff-commit-subject">${esc(commit.subject || 'Untitled commit')}</span>
        <span class="handoff-commit-date">${esc(commitDateLabel(commit.date))}</span>
      </div>`;
  }

  function renderHandoffTimeline(item) {
    const entries = parseTimelineEntries(item.body);
    return `
      <section class="handoff-timeline-section">
        <div class="handoff-section-head">
          <span>Handoff timeline</span>
          <span>${esc(sourceLabel(item))}</span>
        </div>
        ${
          entries.length
            ? `<div class="handoff-timeline-list">${entries.map(renderTimelineEntry).join('')}</div>`
            : '<div class="handoff-commit-empty">No handoff updates yet.</div>'
        }
      </section>`;
  }

  function renderTimelineEntry(entry, index) {
    return `
      <article class="handoff-timeline-card">
        <div class="handoff-timeline-marker" aria-hidden="true"></div>
        <div class="handoff-timeline-content">
          <div class="handoff-timeline-top">
            <h4>${esc(entry.title || `Update ${index + 1}`)}</h4>
            ${entry.meta ? `<span>${esc(entry.meta)}</span>` : ''}
          </div>
          <div class="handoff-timeline-body">${formatTimelineBody(entry.body)}</div>
        </div>
      </article>`;
  }

  function parseTimelineEntries(body) {
    const text = String(body || '')
      .replace(/\r\n/g, '\n')
      .trim();
    if (!text) return [];
    const lines = text.split('\n');
    const entries = [];
    let current = null;
    const start = (title, meta, firstLine) => {
      if (current) entries.push(current);
      current = { title, meta, lines: [] };
      if (firstLine) current.lines.push(firstLine);
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
      const bold = trimmed.match(/^\*\*([^*]+)\*\*\s*-?\s*(.*)$/);
      const dated = trimmed.match(/^-?\s*(\d{4}-\d{2}-\d{2}(?:[ T][^:]+)?)[:\s-]+(.+)$/);
      if (heading) {
        start(heading[1], '', '');
      } else if (bold) {
        start(bold[1], '', bold[2] || '');
      } else if (dated) {
        start(dated[2], dated[1], '');
      } else if (current) {
        current.lines.push(line);
      } else {
        start('Latest handoff', '', line);
      }
    }
    if (current) entries.push(current);
    return entries.map((entry) => ({
      title: entry.title,
      meta: entry.meta,
      body: entry.lines.join('\n').trim(),
    }));
  }

  function formatTimelineBody(body) {
    const text = String(body || '').trim();
    if (!text) return '<p>No detail.</p>';
    return text
      .split(/\n{2,}/)
      .map((block) => `<p>${esc(block).replace(/\n/g, '<br />')}</p>`)
      .join('');
  }

  function openAddModal() {
    const overlay = document.getElementById('handoff-modal-overlay');
    if (!overlay) return;
    ['handoff-modal-title', 'handoff-modal-thread', 'handoff-modal-repo', 'handoff-modal-body'].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el).value = '';
      },
    );
    const browseBtn = overlay.querySelector('.local-browse-btn');
    if (browseBtn) browseBtn.hidden = !window.contextEngineDesktop?.selectFolder;
    overlay.classList.add('open');
    setTimeout(() => document.getElementById('handoff-modal-title')?.focus(), 0);
  }

  function closeAddModal(event) {
    if (event && event.target.id !== 'handoff-modal-overlay') return;
    document.getElementById('handoff-modal-overlay')?.classList.remove('open');
  }

  async function browseRepoPath() {
    const picker = window.contextEngineDesktop?.selectFolder;
    if (!picker) return Toast.error('Folder picker not available in this environment');
    try {
      const picked = await picker({ title: 'Select repository folder' });
      if (picked) {
        const el = /** @type {HTMLInputElement|null} */ (document.getElementById('handoff-modal-repo'));
        if (el) el.value = picked;
      }
    } catch (err) {
      console.error('handoffs: folder picker failed', err);
      Toast.error('Could not open folder picker');
    }
  }

  async function createFromModal() {
    const title = /** @type {HTMLInputElement|null} */ (
      document.getElementById('handoff-modal-title')
    )?.value.trim();
    const thread_tag = /** @type {HTMLInputElement|null} */ (
      document.getElementById('handoff-modal-thread')
    )?.value.trim();
    const repo = /** @type {HTMLInputElement|null} */ (
      document.getElementById('handoff-modal-repo')
    )?.value.trim();
    const body =
      /** @type {HTMLTextAreaElement|null} */ (document.getElementById('handoff-modal-body'))?.value || '';
    if (!title) return Toast.error('Title is required');
    const result = await apiFetch('/handoffs', 'POST', { title, thread_tag, repo, body });
    if (!result?.ok) return;
    closeAddModal();
    view = 'active';
    selected = result.handoff.slug;
    Toast.success('Handoff created');
    await load();
  }

  function typeLabel(type) {
    if (type === 'dual') return 'Project + thread';
    if (type === 'project') return 'Project';
    return 'Thread';
  }

  function bindingLabel(item) {
    if (item.thread_tag) return item.thread_tag;
    if (item.repo) return projectTitle(item.repo);
    return item.slug;
  }

  /**
   * Project title for a repo-bound handoff: the basename of the repo path.
   * Falls back to "shortPath" when the path is rootless. Used in the card
   * project-name badge and as bindingLabel for project handoffs.
   * @param {string} value
   */
  function projectTitle(value) {
    const cleaned = String(value || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (!cleaned) return '';
    const last = cleaned.split('/').filter(Boolean).pop();
    return last || cleaned;
  }

  function sourceLabel(item) {
    if (item.repo) return '.context-engine/handoff.md';
    return item.thread_tag || 'thread handoff';
  }

  function shortPath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .join('/');
  }

  function preview(body) {
    const text = String(body || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 150 ? `${text.slice(0, 150).trim()}...` : text || 'No body yet.';
  }

  function ageLabel(value) {
    const t = new Date(value || 0).getTime();
    if (!Number.isFinite(t) || !t) return 'Unknown age';
    const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  function commitDateLabel(value) {
    const t = new Date(value || 0);
    if (!Number.isFinite(t.getTime())) return 'Unknown date';
    return t.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function init() {
    if (initialized) return ensureLoaded();
    initialized = true;
    document.getElementById('handoffs-search-input')?.addEventListener('input', (event) => {
      query = event.target.value || '';
      selected = '';
      render();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAddModal();
    });
    await load();
  }

  async function ensureLoaded() {
    if (!initialized) return init();
    if (!loaded) return load();
    render();
  }

  return {
    init,
    ensureLoaded,
    render,
    select,
    setView,
    setLayout,
    save,
    archive,
    restore,
    purge,
    openAddModal,
    closeAddModal,
    createFromModal,
    browseRepoPath,
  };
})();
