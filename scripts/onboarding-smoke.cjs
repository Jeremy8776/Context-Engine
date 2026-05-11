#!/usr/bin/env node
// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_ROOT = path.join(os.tmpdir(), 'context-engine-onboarding-smoke');
const PORT = Number(process.env.CE_ONBOARDING_SMOKE_PORT || 3873);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seedProfile() {
  fs.rmSync(PROFILE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'data'), path.join(PROFILE_ROOT, 'data'), {
    recursive: true,
    filter: (src) => !/[\\/]session-log\.json$/i.test(src),
  });
  fs.cpSync(path.join(ROOT, 'skills'), path.join(PROFILE_ROOT, 'skills'), { recursive: true });
}

/** @param {BrowserWindow} win @param {string} source */
function js(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

/** @param {BrowserWindow} win @param {string} source @param {number=} timeoutMs */
async function waitFor(win, source, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await js(win, source)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${source}`);
}

async function run() {
  seedProfile();
  process.env.CE_ROOT = PROFILE_ROOT;
  process.env.CE_PORT = String(PORT);
  process.env.CE_NEW_USER_PROFILE = '1';

  const { startServer } = require('../server/server');
  const server = startServer({ port: PORT, refresh: false });

  try {
    await app.whenReady();
    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      show: true,
      backgroundColor: '#000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    await win.loadURL(`http://127.0.0.1:${PORT}/`);
    await waitFor(win, `(() => document.getElementById('loader')?.classList.contains('hidden'))()`);
    await waitFor(win, `(() => document.querySelector('.onboarding-root'))()`);

    const discovery = await js(
      win,
      `(() => ({
        heading: document.querySelector('.onboarding-panel h1')?.textContent || '',
        hosts: document.querySelectorAll('.onboarding-host').length,
        metrics: document.querySelectorAll('.onboarding-metric').length,
      }))()`,
    );
    assert(/found your working setup/i.test(discovery.heading), 'Discovery heading is missing');
    assert(discovery.hosts >= 2, 'Expected detected host cards');
    assert(discovery.metrics >= 4, 'Expected context metrics');

    await js(win, `Onboarding.go('connect')`);
    await waitFor(win, `(() => /Wire CE/.test(document.body.innerText))()`);
    await js(win, `Onboarding.go('health')`);
    await waitFor(win, `(() => /Prove the bridge/.test(document.body.innerText))()`);
    await js(win, `Onboarding.finish()`);
    await waitFor(win, `(() => !document.querySelector('.onboarding-root'))()`);

    const statePath = path.join(PROFILE_ROOT, 'data', 'onboarding.json');
    assert(fs.existsSync(statePath), 'onboarding.json was not written');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert(state.completedAt, 'onboarding completedAt was not saved');
    console.log('onboarding smoke ok');
  } finally {
    server.close();
  }
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  });
