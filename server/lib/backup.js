// backup.js — Backup, restore, and session logging

const fs   = require('fs');
const path = require('path');
const { DATA_DIR, BACKUPS_DIR, CONTEXT_MD, SESSION_LOG } = require('./config');

function readData(f) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return null; } }
function writeData(f, d) { fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2), 'utf8'); }

function createBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(BACKUPS_DIR, ts);
  fs.mkdirSync(dir, { recursive: true });
  ['memory.json', 'rules.json', 'skill-states.json'].forEach(f => {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  });
  if (fs.existsSync(CONTEXT_MD)) fs.copyFileSync(CONTEXT_MD, path.join(dir, 'CONTEXT.md'));
  return { timestamp: ts };
}

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR)
    .filter(d => fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort().reverse().slice(0, 20).map(ts => ({ timestamp: ts }));
}

function restoreBackup(ts) {
  const dir = path.join(BACKUPS_DIR, ts);
  if (!fs.existsSync(dir)) return false;
  ['memory.json', 'rules.json', 'skill-states.json'].forEach(f => {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA_DIR, f));
  });
  const cm = path.join(dir, 'CONTEXT.md');
  if (fs.existsSync(cm)) fs.copyFileSync(cm, CONTEXT_MD);
  return true;
}

function getSessionLog() {
  try { return JSON.parse(fs.readFileSync(SESSION_LOG, 'utf8')); }
  catch { return { sessions: [] }; }
}

function appendSession(entry) {
  const log = getSessionLog();
  log.sessions.unshift({ ...entry, ts: new Date().toISOString() });
  log.sessions = log.sessions.slice(0, 50);
  fs.writeFileSync(SESSION_LOG, JSON.stringify(log, null, 2), 'utf8');
}

module.exports = { readData, writeData, createBackup, listBackups, restoreBackup, getSessionLog, appendSession };
