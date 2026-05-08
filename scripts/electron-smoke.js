#!/usr/bin/env node
// @ts-check

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { createContextServer, startServer } = require('../server/server');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_MAIN = path.join(ROOT, 'electron', 'main.cjs');
const ELECTRON_PRELOAD = path.join(ROOT, 'electron', 'preload.cjs');
const ELECTRON_UPDATER = path.join(ROOT, 'electron', 'updater.cjs');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string} filePath */
function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Resolve every relative require() in `filePath` the same way Node would at
// runtime. Catches missing-extension bugs (e.g. require('./updater') when the
// file is updater.cjs) that string-grep checks miss entirely.
/** @param {string} filePath */
function assertRelativeRequiresResolve(filePath) {
  const source = read(filePath);
  const localRequire = Module.createRequire(filePath);
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const spec = match[1];
    if (!spec) continue;
    try {
      localRequire.resolve(spec);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${path.relative(ROOT, filePath)}: require('${spec}') does not resolve — ${msg}`);
    }
  }
}

function main() {
  const pkg = JSON.parse(read(PACKAGE_JSON));
  const mainSource = read(ELECTRON_MAIN);
  const preloadSource = read(ELECTRON_PRELOAD);

  assertRelativeRequiresResolve(ELECTRON_MAIN);
  assertRelativeRequiresResolve(ELECTRON_PRELOAD);
  assertRelativeRequiresResolve(ELECTRON_UPDATER);

  assert(pkg.main === 'electron/main.cjs', 'package.json main must point at electron/main.cjs');
  assert(typeof createContextServer === 'function', 'server must export createContextServer');
  assert(typeof startServer === 'function', 'server must export startServer');
  assert(mainSource.includes("require('electron')"), 'main process must import electron');
  assert(mainSource.includes('startServer'), 'main process must start the embedded server');
  assert(mainSource.includes('contextIsolation: true'), 'preload boundary must use context isolation');
  assert(mainSource.includes('nodeIntegration: false'), 'renderer must keep nodeIntegration disabled');
  assert(mainSource.includes("titleBarStyle: 'hidden'"), 'main window must use hidden native titlebar');
  assert(mainSource.includes('CE_HOT_RELOAD'), 'main process must support hot reload mode');
  assert(preloadSource.includes('contextBridge.exposeInMainWorld'), 'preload must expose a narrow bridge');
  assert(preloadSource.includes('window:minimize'), 'preload must expose window controls through IPC');

  const server = createContextServer();
  assert(server && typeof server.listen === 'function', 'embedded server factory must return an HTTP server');
  server.close();
  console.log('electron smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
