// @ts-check

// Update lifecycle wiring for both runtimes:
//
//   Browser/server mode:
//     Polls /api/version. On a version change, shows an action toast that
//     reloads the page. Used when the app is served standalone without
//     Electron (e.g. dev or someone hitting the local server in a browser).
//
//   Electron desktop mode:
//     Subscribes to update events from the main process (electron-updater
//     via contextEngineDesktop.onUpdateEvent). Auto-download is handled
//     in main; this module surfaces the lifecycle to the user and gates
//     install on an explicit Restart click.
//
// Electron mode wins when both are available — the desktop updater drives
// the real binary, the version poll is just a same-version sanity ping.
//
// SEE ALSO:
//   electron/updater.cjs              — main-process electron-updater module
//   electron/preload.cjs              — IPC bridge (onUpdateEvent, installUpdate)
//   ui/store.js                       — Toast.action() definition consumed below

const AppUpdate = (() => {
  const POLL_MS = 30000;
  /** @type {string | null} */
  let currentVersion = null;
  let pollToastShown = false;
  let downloadedToastShown = false;
  /** @type {HTMLElement | null} */
  let progressToastEl = null;

  // ===== Browser/server polling path =====

  async function pollCheck() {
    const data = await DS.getAppVersion();
    if (!data?.version) return;
    if (!currentVersion) {
      currentVersion = data.version;
      return;
    }
    if (data.version === currentVersion || pollToastShown) return;
    pollToastShown = true;
    Toast.action('Update available', 'Reload', () => window.location.reload());
  }

  function startPolling() {
    pollCheck();
    setInterval(pollCheck, POLL_MS);
  }

  // ===== Electron desktop updater path =====

  /** @param {number} percent */
  function showProgress(percent) {
    if (!progressToastEl) {
      const container = document.querySelector('.toast-container');
      if (!container) return;
      progressToastEl = document.createElement('div');
      progressToastEl.className = 'toast toast-info visible';
      progressToastEl.innerHTML =
        '<span class="toast-icon">i</span>' + '<span class="toast-message">Downloading update… 0%</span>';
      container.appendChild(progressToastEl);
    }
    const msg = progressToastEl.querySelector('.toast-message');
    if (msg) msg.textContent = `Downloading update… ${percent}%`;
  }

  function clearProgress() {
    if (progressToastEl) {
      progressToastEl.classList.remove('visible');
      setTimeout(() => progressToastEl?.remove(), 300);
      progressToastEl = null;
    }
  }

  /** @param {{ event?: string, version?: string, percent?: number, [key: string]: unknown }} payload */
  function handleDesktopEvent(payload) {
    if (!payload?.event) return;
    switch (payload.event) {
      case 'checking':
        // Silent — too chatty for a toast.
        break;
      case 'available':
        Toast.info(`Update ${payload.version || ''} available — downloading…`.trim(), 4000);
        break;
      case 'not-available':
        // Silent — only show if the user explicitly asked, which we don't yet.
        break;
      case 'progress':
        if (typeof payload.percent === 'number') showProgress(payload.percent);
        break;
      case 'downloaded':
        clearProgress();
        if (downloadedToastShown) return;
        downloadedToastShown = true;
        Toast.action(`Update ${payload.version || ''} ready — restart to install`.trim(), 'Restart', () =>
          window.contextEngineDesktop?.installUpdate?.(),
        );
        break;
      case 'error':
        clearProgress();
        Toast.error(`Update error: ${payload.message || 'unknown'}`);
        break;
    }
  }

  function startDesktopBridge() {
    const desktop = window.contextEngineDesktop;
    if (!desktop?.onUpdateEvent) return false;
    desktop.onUpdateEvent(handleDesktopEvent);
    return true;
  }

  function init() {
    const desktopBound = startDesktopBridge();
    // In Electron mode the desktop updater is authoritative — skip the poll
    // to avoid duplicate "update available" signals. In browser mode the
    // poll is the only signal we have.
    if (!desktopBound || window.contextEngineDesktop?.runtime !== 'electron') {
      startPolling();
    }
  }

  return { init, check: pollCheck };
})();

document.addEventListener('DOMContentLoaded', AppUpdate.init);