// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// Auto-update wiring backed by electron-updater + the GitHub releases channel
// configured in package.json `build.publish`. The renderer receives lifecycle
// events via `contextEngineDesktop.onUpdateEvent` and can trigger install via
// `contextEngineDesktop.installUpdate`. Install is gated on user action — no
// silent restarts.
//
// SEE ALSO:
//   electron/preload.cjs              — IPC bridge (onUpdateEvent, installUpdate)
//   ui/app-update.js                  — renderer-side toast consumer
//   electron/main.cjs                 — startAutoUpdate() invocation point
//   package.json (build.publish)      — GitHub release channel definition
//   .github/workflows/release.yml     — CI that produces the assets this reads

const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let attached = false;

function send(event, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update:event', { event, ...payload });
}

function bindUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info?.version }));
  autoUpdater.on('update-not-available', (info) => send('not-available', { version: info?.version }));
  autoUpdater.on('error', (err) => send('error', { message: err?.message || String(err) }));
  autoUpdater.on('download-progress', (p) =>
    send('progress', {
      percent: Math.round(p?.percent || 0),
      transferred: p?.transferred,
      total: p?.total,
    }),
  );
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info?.version }));
}

function bindIpc() {
  ipcMain.on('update:install', () => {
    // quitAndInstall(true, true): non-silent installer, restart on completion.
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      send('error', { message: err?.message || String(err) });
    }
  });
}

function startAutoUpdate(window, options = {}) {
  mainWindow = window;

  // Skip in dev — electron-updater requires a real packaged app to read the
  // application metadata it uses to compare versions.
  if (!app.isPackaged) {
    console.log('[ce-updater] skipped: app is not packaged (dev mode)');
    return;
  }

  if (attached) return;
  attached = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  bindUpdaterEvents();
  bindIpc();

  // Initial check shortly after launch so the window is ready to receive events.
  const initialDelayMs = options.initialDelayMs ?? 8_000;
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[ce-updater] initial check failed:', err?.message || err);
    });
  }, initialDelayMs);

  // Recurring check every 6 hours while the app is open.
  const intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1000;
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[ce-updater] scheduled check failed:', err?.message || err);
    });
  }, intervalMs);
}

module.exports = { startAutoUpdate };
