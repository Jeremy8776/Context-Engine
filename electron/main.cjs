// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

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

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PORT, ROOT, UI_DIR } = require('../server/lib/config');
const { startServer } = require('../server/server');
const { startAutoUpdate } = require('./updater.cjs');

let mainWindow = null;
let server = null;
const smokeMode = process.env.CE_ELECTRON_SMOKE === '1';
const hotReload = process.env.CE_HOT_RELOAD === '1';
const newUserProfile =
  process.env.CE_NEW_USER_PROFILE === '1' || process.argv.some((arg) => arg === '--ce-new-user');
const windowBackground = '#000000';
const appIconPath = path.join(__dirname, '..', 'ui', 'assets', 'brand', 'icon.ico');

if (smokeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

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

if (newUserProfile) {
  const userDataPath = path.join(ROOT, '.electron-user-data');
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  console.log(`[ce-electron] isolated userData: ${userDataPath}`);
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
      // Sandboxed renderer + sandboxed preload. The preload only uses
      // contextBridge / ipcRenderer, both of which are sandbox-safe.
      sandbox: true,
    },
  });

  // Some dev-mode launches don't fully honour the constructor `icon` for the
  // taskbar entry. Explicitly setting it after construction is the reliable path.
  if (process.platform === 'win32' && fs.existsSync(appIconPath)) {
    try {
      mainWindow.setIcon(appIconPath);
    } catch (err) {
      console.warn('[ce-electron] setIcon failed:', err.message);
    }
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
  // Only open external links over http(s) or mailto. Blocks file://, vscode://,
  // ms-cxh:// and other custom URI schemes that could be triggered by hostile
  // content rendered in the local UI (e.g. injected via a skill body).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        void shell.openExternal(url);
      } else {
        console.warn(`[ce-electron] blocked external open with protocol ${parsed.protocol}: ${url}`);
      }
    } catch {
      console.warn(`[ce-electron] blocked external open with invalid URL: ${url}`);
    }
    return { action: 'deny' };
  });

  // Block in-window navigation away from the local UI origin. Defense in depth
  // against a renderer that somehow follows a link into untrusted content.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== `http://127.0.0.1:${PORT}`) {
        event.preventDefault();
        if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
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
  app.relaunch({ args: process.argv.slice(1) });
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
  watchPath(UI_DIR, (changedPath) => {
    if (/\.(html|css|js|svg)$/i.test(changedPath)) {
      console.log('[desktop-dev] Renderer reload:', path.relative(UI_DIR, changedPath));
      reloadRenderer();
    }
  });
  [path.join(__dirname), path.join(__dirname, '..', 'server')].forEach((rootDir) => {
    watchPath(rootDir, (changedPath) => {
      if (/\.(cjs|js|json)$/i.test(changedPath)) {
        console.log(
          '[desktop-dev] Main/server change, relaunching:',
          path.relative(path.join(__dirname, '..'), changedPath),
        );
        relaunchApp();
      }
    });
  });
}

void app.whenReady().then(() => {
  server = startServer({ port: PORT, refresh: true });
  server.on('error', (error) => {
    const msg = error instanceof Error ? error.message : String(error);
    const detail =
      error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE'
        ? `Context Engine is already running on 127.0.0.1:${PORT}. Close the other Context Engine window or start this profile with a different port.`
        : msg;
    console.error('[ce-electron] server failed:', detail);
    dialog.showErrorBox('Context Engine could not start', detail);
    app.exit(1);
  });
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