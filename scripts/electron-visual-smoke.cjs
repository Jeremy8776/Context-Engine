#!/usr/bin/env node
// @ts-check

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { startServer } = require('../server/server');

const PORT = Number(process.env.CE_VISUAL_SMOKE_PORT || 3868);
const OUT_DIR = path.join(os.tmpdir(), 'context-engine-visual-smoke');
const SCREENSHOTS = [
  { name: 'outputs-desktop', width: 1366, height: 900 },
  { name: 'outputs-min-window', width: 1100, height: 760 },
];

/** @type {import('http').Server | null} */
let server = null;
/** @type {Array<{ level: number, message: string, sourceId?: string }>} */
const consoleIssues = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRelevantConsoleIssue(item) {
  if (item.level < 2) return false;
  const text = `${item.message} ${item.sourceId || ''}`;
  return !/(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|upload\.wikimedia|dashboard-icons)/i.test(text);
}

/** @param {BrowserWindow} win @param {string} source */
function js(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

/** @param {BrowserWindow} win @param {string} source @param {number=} timeoutMs */
async function waitFor(win, source, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await js(win, source)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${source}`);
}

/** @param {BrowserWindow} win @param {string} name */
async function capture(win, name) {
  const image = await win.webContents.capturePage();
  const filePath = path.join(OUT_DIR, `${name}.png`);
  const buffer = image.toPNG();
  assert(buffer.length > 20_000, `${name} screenshot looks empty (${buffer.length} bytes)`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  server = startServer({ port: PORT, refresh: false });

  await app.whenReady();
  const win = new BrowserWindow({
    width: SCREENSHOTS[0].width,
    height: SCREENSHOTS[0].height,
    minWidth: 1100,
    minHeight: 760,
    show: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_event, level, message, _line, sourceId) => {
    consoleIssues.push({ level, message, sourceId });
  });

  await win.loadURL(`http://127.0.0.1:${PORT}/#compile`);
  win.focus();
  await waitFor(
    win,
    `(() => document.getElementById('loader')?.classList.contains('hidden') && document.querySelector('#compile-tab.active'))()`,
  );
  await waitFor(win, `(() => document.querySelectorAll('#mcp-hosts-list .mcp-host-row').length >= 1)()`);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const overview = await js(
    win,
    `(() => {
      const host = document.querySelector('.mcp-host-card')?.getBoundingClientRect();
      const configureButtons = [...document.querySelectorAll('#mcp-hosts-list button')]
        .filter(button => button.textContent.trim() === 'Configure');
      return {
        title: document.title,
        bodyText: document.body.innerText,
        hostTop: host?.top ?? 9999,
        statusText: document.getElementById('compile-connection-status')?.innerText || '',
        navStatusExists: !!document.getElementById('server-status'),
        hasCompileIndex: !!document.getElementById('compile-index-status'),
        hasWorkspaceSection: !!document.getElementById('compile-fallback-card'),
        hostCount: document.querySelectorAll('#mcp-hosts-list .mcp-host-row').length,
        configureCount: configureButtons.length,
      };
    })()`,
  );

  assert(overview.title === 'Context Engine', `Unexpected title: ${overview.title}`);
  assert(String(overview.statusText).includes('Reachable'), 'Connection status is missing');
  assert(
    !String(overview.statusText).includes('http://127.0.0.1'),
    'Connection endpoint should not render in page header',
  );
  assert(!overview.navStatusExists, 'Sidebar server status should not render');
  assert(!overview.hasCompileIndex, 'Vector index should not render on Connections page');
  assert(!overview.hasWorkspaceSection, 'Workspace files section should not render on Connections page');
  assert(overview.hostCount >= 1, 'No host cards rendered');
  assert(overview.configureCount >= 1, 'No Configure buttons rendered');

  const desktopShot = await capture(win, SCREENSHOTS[0].name);

  await js(
    win,
    `(() => {
      const button = [...document.querySelectorAll('#mcp-hosts-list button')]
        .find(item => item.textContent.trim() === 'Configure');
      button?.click();
    })()`,
  );
  await waitFor(win, `(() => document.getElementById('side-panel')?.classList.contains('open'))()`);
  await waitFor(
    win,
    `(() => {
      const rect = document.getElementById('side-panel')?.getBoundingClientRect();
      return !!rect && rect.left < window.innerWidth - 120;
    })()`,
  );

  const detailPanel = await js(
    win,
    `(() => ({
      title: document.getElementById('sp-title')?.textContent || '',
      bodyText: document.getElementById('sp-body')?.innerText || '',
      actionText: document.querySelector('#sp-body .sp-actions')?.innerText || '',
    }))()`,
  );
  assert(String(detailPanel.title).length > 0, 'Detail panel title did not update');
  assert(String(detailPanel.bodyText).includes('Connection checklist'), 'Detail panel checklist is missing');
  assert(
    /Connect host|Re-apply config|Copy snippet|Re-check hosts|Close/.test(String(detailPanel.actionText)),
    'Detail panel actions are missing',
  );
  const modalShot = await capture(win, 'outputs-detail-panel');

  await js(
    win,
    `(() => {
      const card = [...document.querySelectorAll('#mcp-hosts-list .mcp-host-row')]
        .find(item => item.innerText.toLowerCase().includes('codex cli'));
      card?.click();
    })()`,
  );
  await waitFor(
    win,
    `(() => document.getElementById('side-panel')?.classList.contains('open') && document.getElementById('sp-title')?.textContent.includes('Codex CLI'))()`,
  );

  win.setSize(SCREENSHOTS[1].width, SCREENSHOTS[1].height);
  await waitFor(win, `(() => document.querySelector('.mcp-host-card')?.getBoundingClientRect().width > 0)()`);
  const minShot = await capture(win, SCREENSHOTS[1].name);

  const relevantIssues = consoleIssues.filter(isRelevantConsoleIssue);
  assert(
    relevantIssues.length === 0,
    `Relevant console issues:\n${relevantIssues.map((item) => `${item.level}: ${item.message}`).join('\n')}`,
  );

  console.log('electron visual smoke ok');
  console.log(`screenshots:\n${desktopShot}\n${modalShot}\n${minShot}`);
}

run()
  .then(() => {
    if (server) server.close();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    if (server) server.close();
    app.exit(1);
  });
