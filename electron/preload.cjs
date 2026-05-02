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
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.runtime = 'electron';
});
