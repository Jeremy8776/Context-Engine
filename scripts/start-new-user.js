#!/usr/bin/env node
// @ts-check

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(
  ROOT,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const PROFILE_ROOT = path.join(ROOT, '.tmp', 'new-user-profile');
const PROFILE_DATA = path.join(PROFILE_ROOT, 'data');
const PROFILE_SKILLS = path.join(PROFILE_ROOT, 'skills');
const SOURCE_DATA = path.join(ROOT, 'data');
const SOURCE_SKILLS = path.join(ROOT, 'skills');

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

/** @param {number} port */
function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** @param {number} preferred */
async function findPort(preferred) {
  for (let port = preferred; port < preferred + 20; port += 1) {
    if (await canUsePort(port)) return port;
  }
  throw new Error(`No free Context Engine dev port found from ${preferred} to ${preferred + 19}`);
}

async function startNewUserProfile() {
  seedProfile();

  const preferredPort = Number(process.env.CE_NEW_USER_PORT || 3869);
  const port = String(await findPort(preferredPort));
  const electronArgs = ['.', `--ce-root=${PROFILE_ROOT}`, `--ce-port=${port}`, '--ce-new-user'];

  console.log(`[start:new] CE_ROOT=${PROFILE_ROOT}`);
  console.log(`[start:new] CE_PORT=${port}`);

  const child = spawn(ELECTRON_EXE, electronArgs, {
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

if (require.main === module) {
  startNewUserProfile().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = { startNewUserProfile };
