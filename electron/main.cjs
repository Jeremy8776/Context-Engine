// Electron main process. Owns the BrowserWindow, the embedded HTTP server
// lifecycle, the auto-updater wiring, and the IPC handlers the preload
// bridge speaks to.
//
// SEE ALSO:
//   electron/preload.cjs              — renderer-facing bridge surface
//   electron/updater.cjs              — auto-update lifecycle (started here)
//   server/server.js                  — embedded HTTP server (started here)
//   ui/assets/brand/icon.ico          — taskbar icon set on BrowserWindow + setIcon
//   package.json (build.appId)        — must match app.setAppUserModelId below

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PORT, UI_DIR } = require('../server/lib/config');
const { startServer } = require('../server/server');
const { startAutoUpdate } = require('./updater');

let mainWindow = null;
let server = null;
const smokeMode = process.env.CE_ELECTRON_SMOKE === '1';
const hotReload = process.env.CE_HOT_RELOAD === '1';
const windowBackground = '#000000';
const appIconPath = path.join(__dirname, '..', 'ui', 'assets', 'brand', 'icon.ico');

// Verify the icon file is reachable; surface a clear log if not so the
// taskbar-icon symptom maps to a real diagnostic.
if (!fs.existsSync(appIconPath)) {
  console.warn(`[ce-electron] icon not found at ${appIconPath} — taskbar will fall back to Electron default`);
} else {
  console.log(`[ce-electron] taskbar icon: ${appIconPath}`);
}

// Windows groups taskbar entries by AppUserModelID. Without this the dev-mode
// taskbar icon falls back to the Electron default and ignores the BrowserWindow
// icon. Must be set before any window is created.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.datacert.context-engine');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1660,
    height: 1040,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: windowBackground,
    title: 'Context Engine',
    icon: appIconPath,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Some dev-mode launches don't fully honour the constructor `icon` for the
  // taskbar entry. Explicitly setting it after construction is the reliable path.
  if (process.platform === 'win32' && fs.existsSync(appIconPath)) {
    try { mainWindow.setIcon(appIconPath); }
    catch (err) { console.warn('[ce-electron] setIcon failed:', err.message); }
  }

  void mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
  if (smokeMode) {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('electron launch smoke ok');
      app.quit();
    });
    mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`electron launch smoke failed: ${code} ${description}`);
      process.exitCode = 1;
      app.quit();
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function reloadRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.reloadIgnoringCache();
}

function relaunchApp() {
  app.relaunch();
  app.exit(0);
}

function shouldIgnoreWatchPath(filePath) {
  return /(?:^|[\\/])(?:node_modules|data|skills|\.git)[\\/]/i.test(filePath);
}

function watchPath(rootDir, onChange) {
  if (!fs.existsSync(rootDir)) return;
  let timer = null;
  fs.watch(rootDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const changedPath = path.join(rootDir, filename.toString());
    if (shouldIgnoreWatchPath(changedPath)) return;
    clearTimeout(timer);
    timer = setTimeout(() => onChange(changedPath), 120);
  });
}

function setupHotReload() {
  if (!hotReload) return;
  console.log('[desktop-dev] Hot reload enabled');
  watchPath(UI_DIR, changedPath => {
    if (/\.(html|css|js|svg)$/i.test(changedPath)) {
      console.log('[desktop-dev] Renderer reload:', path.relative(UI_DIR, changedPath));
      reloadRenderer();
    }
  });
  [path.join(__dirname), path.join(__dirname, '..', 'server')].forEach(rootDir => {
    watchPath(rootDir, changedPath => {
      if (/\.(cjs|js|json)$/i.test(changedPath)) {
        console.log('[desktop-dev] Main/server change, relaunching:', path.relative(path.join(__dirname, '..'), changedPath));
        relaunchApp();
      }
    });
  });
}

void app.whenReady().then(() => {
  server = startServer({ port: PORT, refresh: true });
  createWindow();
  setupHotReload();
  if (mainWindow) startAutoUpdate(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (server) server.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});
