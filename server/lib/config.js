// config.js — Shared paths and constants

const path = require('path');
const os   = require('os');

const PORT     = parseInt(process.env.CE_PORT, 10) || 3847;
const ROOT     = process.env.CE_ROOT || path.join(__dirname, '..', '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const UI_DIR   = path.join(__dirname, '..', '..', 'ui');
const CONTEXT_MD  = path.join(ROOT, 'CONTEXT.md');
const SKILLS_DIR  = path.join(ROOT, 'skills');
const HOMEDIR     = os.homedir();
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const SESSION_LOG = path.join(DATA_DIR, 'session-log.json');
const MODES_FILE  = path.join(DATA_DIR, 'modes.json');
const KEYS_FILE   = path.join(DATA_DIR, '.keys.enc');
const SKILL_CACHE_FILE = path.join(DATA_DIR, 'skill-parse-cache.json');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css',   '.json': 'application/json',
};

module.exports = {
  PORT, ROOT, DATA_DIR, UI_DIR, CONTEXT_MD, SKILLS_DIR,
  HOMEDIR, BACKUPS_DIR, WORKSPACES_FILE, SESSION_LOG,
  MODES_FILE, KEYS_FILE, SKILL_CACHE_FILE, MIME,
};
