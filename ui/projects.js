// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// projects.js — Projects tab for per-project context scoping

const ProjectsTab = (() => {
  let projects = [];
  let query = '';
  let view = 'grid';

  function load() {
    DS.getProjects().then((data) => {
      if (data?.ok) projects = data.projects || [];
      else projects = [];
      render();
    });
  }

  function filtered() {
    if (!query) return projects;
    const q = query.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q) || (p.slug || '').includes(q));
  }

  function render() {
    const list = document.getElementById('projects-list');
    if (!list) return;
    const items = filtered();
    list.classList.toggle('grid-mode', view === 'grid');
    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><p>${
        query ? 'No matching projects.' : 'No projects yet. Create one to scope context per project.'
      }</p></div>`;
      return;
    }
    list.innerHTML = items.map(projectCard).join('');
  }

  function setView(v) {
    view = v;
    document.getElementById('projects-btn-grid')?.classList.toggle('on', v === 'grid');
    document.getElementById('projects-btn-list')?.classList.toggle('on', v === 'list');
    render();
  }

  function projectCard(p) {
    const dateStr = p.created ? new Date(p.created).toLocaleDateString() : '';
    const folderStr = p.path || '';
    const hasPath = !!folderStr;
    return `<div class="handoff-card" data-slug="${esc(p.slug)}">
      <div class="handoff-card-head">
        <h4>${esc(p.name)}</h4>
        <span class="handoff-card-slug">${esc(p.slug)}</span>
      </div>
      <div class="handoff-card-meta">
        ${folderStr ? `<span class="handoff-card-tag">${esc(folderStr)}</span>` : ''}
        ${dateStr ? `<span class="handoff-card-date">${dateStr}</span>` : ''}
      </div>
      <div class="handoff-card-actions">
        ${hasPath ? `<button class="save-btn" onclick="ProjectsTab.openPublishModal('${esc(p.slug)}')" title="Publish rules">Publish Rules</button>` : ''}
        <button class="fb" onclick="ProjectsTab.removeProject('${esc(p.slug)}')" title="Delete project">Delete</button>
      </div>
    </div>`;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function openAddModal() {
    const overlay = document.getElementById('project-modal-overlay');
    if (!overlay) return;
    const nameEl = document.getElementById('project-modal-name');
    const pathEl = document.getElementById('project-modal-path');
    if (nameEl) nameEl.value = '';
    if (pathEl) pathEl.value = '';
    const browseBtn = overlay.querySelector('.local-browse-btn');
    if (browseBtn) browseBtn.hidden = !window.contextEngineDesktop?.selectFolder;
    overlay.classList.add('open');
    if (nameEl) nameEl.focus();
  }

  function closeAddModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('project-modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  async function createFromModal() {
    const nameEl = document.getElementById('project-modal-name');
    const pathEl = document.getElementById('project-modal-path');
    const name = nameEl?.value?.trim();
    if (!name) {
      Toast.warn('Project name is required');
      return;
    }
    const p = pathEl?.value?.trim() || '';
    const result = await DS.createProject(name, p);
    if (result?.ok) {
      projects.push(result.project);
      closeAddModal();
      render();
      Toast.info(`Project "${name}" created`);
    } else {
      Toast.error(result?.error || 'Failed to create project');
    }
  }

  async function removeProject(slug) {
    const ok = await AppDialog.confirm({
      message: `Delete project "${slug}" and all its data?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const result = await DS.deleteProject(slug);
    if (result?.ok) {
      projects = projects.filter((p) => p.slug !== slug);
      render();
      Toast.info(`Project "${slug}" deleted`);
    } else {
      Toast.error(result?.error || 'Failed to delete project');
    }
  }

  async function browsePath() {
    const picker = window.contextEngineDesktop?.selectFolder;
    if (!picker) return Toast.error('Folder picker not available in this environment');
    try {
      const dir = await picker({ title: 'Select project folder' });
      if (dir) {
        const el = document.getElementById('project-modal-path');
        if (el) el.value = dir;
      }
    } catch (err) {
      console.error('projects: folder picker failed', err);
      Toast.error('Could not open folder picker');
    }
  }

  // ---- Publish Modal ----

  async function openPublishModal(slug) {
    const overlay = document.getElementById('project-publish-overlay');
    if (!overlay) return;
    overlay.dataset.slug = slug;
    const project = projects.find((p) => p.slug === slug);
    const titleEl = overlay.querySelector('.publish-modal-title');
    if (titleEl && project) titleEl.textContent = `Publish rules to ${project.name}`;
    const ruleList = document.getElementById('publish-rule-list');
    const targetList = document.getElementById('publish-target-list');
    if (ruleList) {
      const result = await DS.getRuleFiles();
      if (result?.ok) {
        ruleList.innerHTML = result.files
          .map(
            (f) =>
              `<label class="publish-check-item"><input type="checkbox" class="styled-check" name="rule" value="${esc(f.name)}" checked><span>${esc(f.name)}</span></label>`,
          )
          .join('');
      }
    }
    if (targetList) {
      targetList.innerHTML = [
        { id: 'claude', label: 'Claude Code' },
        { id: 'cursor', label: 'Cursor' },
        { id: 'agents', label: 'AGENTS.md' },
        { id: 'copilot', label: 'GitHub Copilot' },
        { id: 'windsurf', label: 'Windsurf' },
        { id: 'codex', label: 'Codex (OpenAI)' },
      ]
        .map(
          (t) =>
            `<label class="publish-check-item"><input type="checkbox" class="styled-check" name="target" value="${t.id}"><span>${t.label}</span></label>`,
        )
        .join('');
    }
    overlay.classList.add('open');
  }

  function closePublishModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('project-publish-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  async function publishFromModal() {
    const overlay = document.getElementById('project-publish-overlay');
    if (!overlay) return;
    const slug = overlay.dataset.slug;
    const ruleChecks = overlay.querySelectorAll('input[name="rule"]:checked');
    const targetChecks = overlay.querySelectorAll('input[name="target"]:checked');
    const ruleNames = Array.from(ruleChecks).map((el) => el.value);
    const targets = Array.from(targetChecks).map((el) => el.value);
    if (!ruleNames.length) {
      Toast.warn('Select at least one rule');
      return;
    }
    if (!targets.length) {
      Toast.warn('Select at least one target format');
      return;
    }
    const result = await DS.publishProjectRules(slug, ruleNames, targets);
    if (result?.ok) {
      closePublishModal();
      const fileNames = Object.values(result.results || {})
        .map((r) => r.filename)
        .join(', ');
      Toast.info(`Published to project: ${fileNames}`);
    } else {
      Toast.error(result?.error || 'Failed to publish rules');
    }
  }

  function init() {
    const searchEl = document.getElementById('projects-search-input');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        query = searchEl.value;
        render();
      });
    }
    load();
  }

  return {
    init,
    load,
    setView,
    openAddModal,
    closeAddModal,
    createFromModal,
    removeProject,
    browsePath,
    openPublishModal,
    closePublishModal,
    publishFromModal,
  };
})();
