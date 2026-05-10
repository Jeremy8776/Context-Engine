#!/usr/bin/env node
// @ts-check

const { startServer } = require('../server/server');
const { startNewUserProfile } = require('./start-new-user');

const args = process.argv.slice(2);
const wantsNewProfile = args.some((arg) => arg === 'new' || arg === '--new' || arg === '--fresh');

if (wantsNewProfile) {
  Promise.resolve(startNewUserProfile()).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  startServer();
}
