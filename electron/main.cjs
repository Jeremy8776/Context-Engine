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

// CRITICAL: route the server's writable root to the OS user-data directory
// when running as a packaged Electron app. Without this, server/lib/config.js
// falls back to __dirname/../../.. — which resolves INSIDE the asar archive
// for a packaged install. Writes either fail silently or land in a location
// that gets wiped on every auto-update, so onboarding completion never
// persists and the user gets re-onboarded on every release.
//
// In dev mode (app.isPackaged === false, npm run desktop), leave CE_ROOT
// unset so config.js continues to resolve to the repo root.
//
// MUST run BEFORE require('../server/lib/config') below — that module
// captures ROOT at load time from a top-level const.
const smokeMode = process.env.CE_ELECTRON_SMOKE === '1';
const newUserProfile =
  process.env.CE_NEW_USER_PROFILE === '1' || process.argv.some((arg) => arg === '--ce-new-user');

if (newUserProfile) {
  // Test isolation: keep both userData AND the writable CE_ROOT under the
  // repo so a smoke run never leaks into a real user's data.
  const userDataPath = path.join(__dirname, '..', '..', '.electron-user-data');
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  if (!process.env.CE_ROOT) process.env.CE_ROOT = userDataPath;
  console.log(`[ce-electron] isolated userData: ${userDataPath}`);
} else if (app.isPackaged && !process.env.CE_ROOT) {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  process.env.CE_ROOT = userData;
  console.log(`[ce-electron] CE_ROOT pinned to userData for packaged build: ${userData}`);
}

// One-time migration of legacy data from <install>/resources/data/ to the
// userData CE_ROOT. v0.2.x and v0.3.0 wrote data alongside the asar archive
// (visible to electron-updater's install-dir wipe on every update), which is
// why onboarding kept re-prompting after auto-update. From v0.3.1 onwards
// data lives in userData; this migration grabs any leftover data the old
// install path happens to still have.
//
// Marker file at <CE_ROOT>/.ce-data-migrated stamps the result so we never
// re-run, even if the user clears their userData/data dir intentionally.
function migrateLegacyDataIfNeeded() {
  if (!app.isPackaged) return;
  const ceRoot = process.env.CE_ROOT;
  if (!ceRoot) return;
  const marker = path.join(ceRoot, '.ce-data-migrated');
  try {
    if (fs.existsSync(marker)) return;
  } catch {
    return;
  }
  const userDataDir = path.join(ceRoot, 'data');
  const stampMarker = () => {
    try {
      fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
    } catch {
      /* best-effort — re-running migration is idempotent */
    }
  };
  try {
    if (fs.existsSync(path.join(userDataDir, 'onboarding.json'))) {
      stampMarker();
      return;
    }
  } catch {
    /* fall through and try the migration */
  }
  const legacyData = path.join(process.resourcesPath, 'data');
  try {
    if (!fs.existsSync(legacyData) || !fs.statSync(legacyData).isDirectory()) {
      stampMarker();
      return;
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.cpSync(legacyData, userDataDir, { recursive: true, errorOnExist: false });
    stampMarker();
    console.log(`[ce-electron] migrated legacy data ${legacyData} → ${userDataDir}`);
  } catch (err) {
    console.error('[ce-electron] legacy data migration failed', err);
  }
}
migrateLegacyDataIfNeeded();

// Seed bundled skills into the writable CE_ROOT on first run after an
// install or update. Skills ship asarUnpacked under app.asar.unpacked/skills
// (see package.json build.asarUnpack); we copy that read-only tree into
// <CE_ROOT>/skills/ once so ingest + edit operations have somewhere
// writable to land. Subsequent runs find skills/ already populated and
// skip — they never re-overwrite user edits.
function seedBundledSkillsIfNeeded() {
  if (!app.isPackaged) return;
  const ceRoot = process.env.CE_ROOT;
  if (!ceRoot) return;
  const userSkillsDir = path.join(ceRoot, 'skills');
  try {
    if (fs.existsSync(userSkillsDir)) return; // already seeded — leave user content alone
  } catch {
    return;
  }
  // For asarUnpack: ["skills/**/*"] entries, electron-builder writes them
  // to <resourcesPath>/app.asar.unpacked/<rel>. Read from there, not from
  // inside the asar where files are shadowed.
  const bundledSkills = path.join(process.resourcesPath, 'app.asar.unpacked', 'skills');
  try {
    if (!fs.existsSync(bundledSkills)) return;
    fs.mkdirSync(userSkillsDir, { recursive: true });
    fs.cpSync(bundledSkills, userSkillsDir, { recursive: true, force: false, errorOnExist: false });
    console.log(`[ce-electron] seeded bundled skills → ${userSkillsDir}`);
  } catch (err) {
    console.error('[ce-electron] failed to seed bundled skills', err);
  }
}
seedBundledSkillsIfNeeded();

const { PORT, UI_DIR } = require('../server/lib/config');
const { startServer } = require('../server/server');
const { startAutoUpdate } = require('./updater.cjs');

let mainWindow = null;
let server = null;
const hotReload = process.env.CE_HOT_RELOAD === '1';
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

// newUserProfile userData isolation now happens at the top of the file,
// before config.js loads, so CE_ROOT is in sync with app.getPath('userData').

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

// Native folder picker. Renderer calls contextEngineDesktop.selectFolder()
// to get a path string back; primarily used by the skill-sources UI in both
// onboarding and the Connections tab so users don't have to paste full paths.
ipcMain.handle('dialog:select-folder', async (_event, options) => {
  const dialogOptions = {
    properties: ['openDirectory'],
    title: (options && typeof options.title === 'string' ? options.title : 'Pick a folder'),
  };
  const result = await dialog.showOpenDialog(mainWindow || undefined, dialogOptions);
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});