// crypto.js — Encrypted API key store (AES-256-GCM, machine-bound)

const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const { KEYS_FILE } = require('./config');

function deriveKey() {
  const material = `${os.hostname()}:${os.homedir()}:${os.userInfo().username}:context-engine-v3`;
  return crypto.createHash('sha256').update(material).digest();
}

function encryptValue(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
}

function decryptValue(envelope) {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  return decipher.update(envelope.data, 'hex', 'utf8') + decipher.final('utf8');
}

function loadKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; } }
function saveKeys(keys) { fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8'); }

function getApiKey(name) {
  const envKey = process.env[name];
  if (envKey) return envKey;
  const keys = loadKeys();
  if (keys[name]) { try { return decryptValue(keys[name]); } catch { return null; } }
  return null;
}

function setApiKey(name, value) {
  const keys = loadKeys();
  keys[name] = encryptValue(value);
  saveKeys(keys);
}

function removeApiKey(name) {
  const keys = loadKeys();
  delete keys[name];
  saveKeys(keys);
}

module.exports = { getApiKey, setApiKey, removeApiKey };
