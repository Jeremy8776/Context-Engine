#!/usr/bin/env node
// @ts-check

const { startServer } = require('../server/server');
const { startNewUserProfile } = require('./start-new-user');

const args = process.argv.slice(2);
const wantsNewProfile = args.some((arg) => arg === 'new' || arg === '--new' || arg === '--fresh');

if (wantsNewProfile) {
  startNewUserProfile();
} else {
  startServer();
}
