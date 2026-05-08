#!/usr/bin/env node
// @ts-check

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const electronBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : electronBin;
const args = process.platform === 'win32' ? ['/d', '/c', electronBin, '.'] : ['.'];

const child = spawn(command, args, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CE_HOT_RELOAD: '1',
  },
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
