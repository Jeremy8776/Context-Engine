// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// projects.js — Projects tab for per-project context scoping

const ProjectsTab = (() => {
  let projects = [];
  let query = '';

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
    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><p>${
        query ? 'No matching projects.' : 'No projects yet. Create one to scope context per project.'
      }</p></div>`;
      return;
    }
    list.innerHTML = items.map(projectCard).join('');
  }

  function projectCard(p) {
    const dateStr = p.created ? new Date(p.created).toLocaleDateString() : '';
    const folderStr = p.path || '';
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

  function browsePath() {
    if (window.contextEngineDesktop?.selectFolder) {
      window.contextEngineDesktop.selectFolder().then((dir) => {
        if (dir) {
          const el = document.getElementById('project-modal-path');
          if (el) el.value = dir;
        }
      });
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

  return { init, load, openAddModal, closeAddModal, createFromModal, removeProject, browsePath };
})();
