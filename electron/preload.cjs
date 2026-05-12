// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

// Renderer ↔ main IPC bridge. Anything exposed here is the only surface
// area the renderer can touch the main process through.
//
// SEE ALSO:
//   electron/main.cjs                 — IPC handlers (window:*, etc.)
//   electron/updater.cjs              — emits 'update:event', listens on 'update:install'
//   ui/app-update.js                  — primary consumer of onUpdateEvent
//   ui/index.html                     — title-bar buttons calling minimize/maximize/close

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contextEngineDesktop', {
  runtime: 'electron',
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  // Auto-update bridge — renderer subscribes to lifecycle events and triggers install.
  onUpdateEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  },
  installUpdate: () => ipcRenderer.send('update:install'),
  // Native folder picker — returns a path string or null on cancel. Consumers
  // (onboarding, connections Sources panel) fall back to the text input when
  // this isn't available (i.e. when running in a plain browser).
  selectFolder: (options) => ipcRenderer.invoke('dialog:select-folder', options || {}),
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.runtime = 'electron';
});