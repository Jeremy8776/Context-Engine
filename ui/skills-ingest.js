// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

const SkillsIngest = (() => {
  function progressElements() {
    let progressEl = document.getElementById('ingest-progress');
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.id = 'ingest-progress';
      progressEl.className = 'ingest-progress';
      document.querySelector('.skills-connect-modal .memory-modal-body')?.appendChild(progressEl);
    }
    progressEl.style.display = 'block';
    progressEl.style.opacity = '1';
    progressEl.innerHTML = '<div class="ingest-log"></div>';
    return {
      progressEl,
      logEl: progressEl.querySelector('.ingest-log'),
    };
  }

  function pushLog(logEl, msg, cls = '') {
    const line = document.createElement('div');
    line.className = 'ingest-log-line' + (cls ? ` ${cls}` : '');
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function logClass(line) {
    if (line.startsWith('Error')) return 'log-error';
    if (line.startsWith('Found:')) return 'log-found';
    if (line.startsWith('Done')) return 'log-done';
    return '';
  }

  async function ingest(refresh) {
    const input = document.getElementById('ingest-url');
    const btn = document.getElementById('btn-ingest');
    const url = input.value.trim();

    if (!url) {
      input.focus();
      return;
    }
    if (!url.startsWith('http')) {
      Toast.error('Must be a full https://... URL');
      return;
    }

    const { logEl } = progressElements();
    btn.textContent = '...';
    btn.disabled = true;
    input.disabled = true;
    pushLog(logEl, 'Sending request to server...');

    const startRes = await DS.ingestRepo(url);
    if (!startRes?.ok || !startRes.jobId) {
      pushLog(logEl, startRes?.error || 'Failed to start ingest job.', 'log-error');
      btn.textContent = 'Import skills';
      btn.disabled = false;
      input.disabled = false;
      return;
    }

    const { jobId } = startRes;
    let lastLogLen = 0;
    const poll = setInterval(async () => {
      const status = await DS.pollIngestJob(jobId);
      if (!status?.ok) {
        clearInterval(poll);
        return;
      }

      const newLines = (status.log || []).slice(lastLogLen);
      lastLogLen = status.log.length;
      newLines.forEach((line) => pushLog(logEl, line, logClass(line)));

      if (status.status === 'done' || status.status === 'error') {
        clearInterval(poll);
        if (status.count > 0) {
          await refresh();
          input.value = '';
          Toast.success(`${status.count} skills imported`);
        }
        btn.textContent = 'Import skills';
        btn.disabled = false;
        input.disabled = false;
      }
    }, 600);
  }

  function quickAdd(slug) {
    SkillsTab.openConnectModal();
    const input = document.getElementById('ingest-url');
    input.value = `https://github.com/${slug}`;
    SkillsTab.ingest();
  }

  function openConnectModal() {
    const overlay = document.getElementById('skills-connect-overlay');
    const input = document.getElementById('ingest-url');
    const progress = document.getElementById('ingest-progress');
    const btn = document.getElementById('btn-ingest');
    if (!overlay || !input) return;
    input.disabled = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Import skills';
    }
    if (progress) {
      progress.innerHTML = '';
      progress.style.display = 'none';
    }
    const localPath = document.getElementById('link-local-path');
    if (localPath) localPath.value = '';
    const localMsg = document.getElementById('link-local-message');
    if (localMsg) localMsg.textContent = '';
    const browseBtn = overlay.querySelector('.local-browse-btn');
    if (browseBtn) browseBtn.hidden = !window.contextEngineDesktop?.selectFolder;
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 0);
  }

  function closeConnectModal(event) {
    if (event && event.target.id !== 'skills-connect-overlay') return;
    document.getElementById('skills-connect-overlay')?.classList.remove('open');
  }

  /** @param {string} value */
  function setLocalPath(value) {
    SkillsIngest._localPath = value;
  }

  async function linkLocalFolder() {
    const trimmed = (SkillsIngest._localPath || '').trim();
    if (!trimmed) return;
    const msgEl = document.getElementById('link-local-message');
    const result = await DS.addSkillSource({ path: trimmed });
    if (result?.ok) {
      if (msgEl) msgEl.textContent = '';
      if (typeof Toast !== 'undefined') Toast.success(`Linked ${result.source?.label || trimmed}`);
      SkillsIngest._localPath = '';
      const localPath = document.getElementById('link-local-path');
      if (localPath) localPath.value = '';
      await loadSkillData();
      if (typeof SkillsTab !== 'undefined') {
        SkillsTab.render();
        SkillsTab.renderStats?.();
      }
      if (typeof SkillSourcesPanel !== 'undefined') SkillSourcesPanel.refresh();
    } else {
      if (msgEl) msgEl.textContent = result?.error || 'Could not link this folder.';
    }
  }

  async function browseLocalFolder() {
    const picker = window.contextEngineDesktop?.selectFolder;
    if (!picker) {
      if (typeof Toast !== 'undefined') Toast.error('Folder picker not available in this environment');
      return;
    }
    try {
      const picked = await picker({ title: 'Pick a folder of SKILL.md files to link' });
      if (picked) {
        const localPath = document.getElementById('link-local-path');
        if (localPath) {
          localPath.value = picked;
          SkillsIngest._localPath = picked;
        }
        await linkLocalFolder();
      }
    } catch (err) {
      console.error('skills-ingest: folder picker failed', err);
      const msgEl = document.getElementById('link-local-message');
      if (msgEl) msgEl.textContent = 'Could not open folder picker.';
    }
  }

  return {
    ingest,
    quickAdd,
    openConnectModal,
    closeConnectModal,
    linkLocalFolder,
    browseLocalFolder,
    _setPath: setLocalPath,
  };
})();
