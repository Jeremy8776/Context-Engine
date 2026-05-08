#!/usr/bin/env node
// @ts-check

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_ROOT = path.join(ROOT, '.tmp', 'new-user-profile');
const PROFILE_DATA = path.join(PROFILE_ROOT, 'data');
const PROFILE_SKILLS = path.join(PROFILE_ROOT, 'skills');
const SOURCE_DATA = path.join(ROOT, 'data');
const SOURCE_SKILLS = path.join(ROOT, 'skills');
const ELECTRON_BIN = path.join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

/** @param {string} dir */
function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** @param {string} source @param {string} target */
function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, {
    recursive: true,
    filter: (src) => !/[\\/]session-log\.json$/i.test(src),
  });
}

function seedProfile() {
  resetDir(PROFILE_ROOT);
  copyDir(SOURCE_DATA, PROFILE_DATA);
  copyDir(SOURCE_SKILLS, PROFILE_SKILLS);
}

function startNewUserProfile() {
  seedProfile();

  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : ELECTRON_BIN;
  const args = process.platform === 'win32' ? ['/d', '/c', ELECTRON_BIN, '.'] : ['.'];
  const port = process.env.CE_NEW_USER_PORT || '3869';

  console.log(`[start:new] CE_ROOT=${PROFILE_ROOT}`);
  console.log(`[start:new] CE_PORT=${port}`);

  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CE_ROOT: PROFILE_ROOT,
      CE_PORT: port,
      CE_HOT_RELOAD: '1',
      CE_NEW_USER_PROFILE: '1',
    },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

if (require.main === module) startNewUserProfile();

module.exports = { startNewUserProfile };
