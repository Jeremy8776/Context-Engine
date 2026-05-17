// @ts-check

// crypto.js — Obfuscated API key store.
// AES-256-GCM with a key derived from hostname + homedir + username. This is
// at-rest obfuscation, not real encryption: anyone with code execution on this
// machine can decrypt. Protects against casual repo / backup leaks only.

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { KEYS_FILE } = require('./config');

function deriveKey() {
  const material = `${os.hostname()}:${os.homedir()}:${os.userInfo().username}:context-engine-v3`;
  return crypto.createHash('sha256').update(material).digest();
}

/**
 * @typedef {{ iv: string, tag: string, data: string }} KeyEnvelope
 * @typedef {Record<string, KeyEnvelope>} KeyStore
 */

/** @param {string} plaintext */
function encryptValue(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
}

/** @param {KeyEnvelope} envelope */
function decryptValue(envelope) {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  return decipher.update(envelope.data, 'hex', 'utf8') + decipher.final('utf8');
}

/** @returns {KeyStore} */
function loadKeys() {
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
/** @param {KeyStore} keys */
function saveKeys(keys) {
  // mode 0o600 — owner read/write only. Honored on POSIX; Windows ignores
  // this and relies on the user-profile ACL, which is sufficient there.
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(KEYS_FILE, 0o600);
  } catch {
    /* best-effort on Windows */
  }
}

/** @param {string} name */
function getApiKey(name) {
  const envKey = process.env[name];
  if (envKey) return envKey;
  const keys = loadKeys();
  if (keys[name]) {
    try {
      return decryptValue(keys[name]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {string} name
 * @param {string} value
 */
function setApiKey(name, value) {
  const keys = loadKeys();
  keys[name] = encryptValue(value);
  saveKeys(keys);
}

/** @param {string} name */
function removeApiKey(name) {
  const keys = loadKeys();
  delete keys[name];
  saveKeys(keys);
}

module.exports = { getApiKey, setApiKey, removeApiKey };
