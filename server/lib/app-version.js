// @ts-check

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const WATCH_DIRS = ['ui', 'server'];
const WATCH_EXTS = new Set(['.css', '.html', '.js', '.json']);

/** @param {string} dir */
function latestCodeMtime(dir) {
  let latest = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) latest = Math.max(latest, latestCodeMtime(fullPath));
    else if (WATCH_EXTS.has(path.extname(item.name)))
      latest = Math.max(latest, fs.statSync(fullPath).mtimeMs);
  }
  return latest;
}

function getAppVersion() {
  const latest = WATCH_DIRS.reduce((max, dir) => {
    const fullPath = path.join(APP_ROOT, dir);
    return fs.existsSync(fullPath) ? Math.max(max, latestCodeMtime(fullPath)) : max;
  }, 0);
  return { version: String(Math.floor(latest)), checkedAt: Date.now() };
}

module.exports = { getAppVersion };
