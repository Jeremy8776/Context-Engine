// @ts-check

// rule-files.js — CRUD for data/rules/*.json rule files.
// Each rule file has the structure: { coding: { hard, soft }, general: { hard, soft }, soul: { soft } }

const fs = require('fs');
const path = require('path');

const RULES_DIR = path.join(__dirname, '..', '..', 'data', 'rules');

/** @typedef {Record<string, Record<string, string>>} RuleData */

function ensureRulesDir() {
  if (!fs.existsSync(RULES_DIR)) fs.mkdirSync(RULES_DIR, { recursive: true });
}

function listRuleFiles() {
  ensureRulesDir();
  const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.json'));
  const result = [];
  for (const f of files) {
    const name = f.slice(0, -5);
    let stat = null;
    try {
      stat = fs.statSync(path.join(RULES_DIR, f));
    } catch {
      stat = null;
    }
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), 'utf8'));
    } catch {
      data = null;
    }
    result.push({ name, filename: f, created: stat?.birthtime?.toISOString() || null, data });
  }
  return result;
}

/** @param {string} name @returns {RuleData | null} */
function readRuleFile(name) {
  const safeName = sanitizeName(name);
  if (!safeName) return null;
  const filePath = path.join(RULES_DIR, `${safeName}.json`);
  if (filePath.includes('..')) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} name @param {RuleData} data @returns {{ ok: boolean, name?: string, error?: string }} */
function writeRuleFile(name, data) {
  ensureRulesDir();
  const safeName = sanitizeName(name);
  if (!safeName) return { ok: false, error: 'Invalid rule name' };
  const filePath = path.join(RULES_DIR, `${safeName}.json`);
  if (filePath.includes('..')) return { ok: false, error: 'Invalid path' };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, name: safeName };
}

/** @param {string} name @returns {{ ok: boolean, error?: string }} */
function deleteRuleFile(name) {
  const safeName = sanitizeName(name);
  if (!safeName) return { ok: false, error: 'Invalid rule name' };
  const filePath = path.join(RULES_DIR, `${safeName}.json`);
  if (filePath.includes('..')) return { ok: false, error: 'Invalid path' };
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Rule file not found' };
  fs.unlinkSync(filePath);
  return { ok: true };
}

/** @param {string} name @returns {string | null} */
function sanitizeName(name) {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || null;
}

/** @param {string[]} names @returns {RuleData} */
function combineRuleFiles(names) {
  /** @type {RuleData & { coding: { hard: string, soft: string }, general: { hard: string, soft: string }, soul: { soft: string } }} */
  const combined = { coding: { hard: '', soft: '' }, general: { hard: '', soft: '' }, soul: { soft: '' } };
  for (const name of names) {
    const data = readRuleFile(name);
    if (!data) continue;
    for (const section of /** @type {('coding'|'general')[]} */ (['coding', 'general'])) {
      for (const priority of /** @type {('hard'|'soft')[]} */ (['hard', 'soft'])) {
        const existing = combined[section][priority] || '';
        const incoming = data[section]?.[priority] || '';
        if (typeof data[section] === 'string') {
          if (priority === 'soft') {
            combined[section][priority] = [existing, data[section]].filter(Boolean).join('\n');
          }
        } else if (incoming) {
          combined[section][priority] = [existing, incoming].filter(Boolean).join('\n');
        }
      }
    }
    if (data.soul) {
      const existing = combined.soul.soft || '';
      const incoming = typeof data.soul === 'string' ? data.soul : data.soul.soft || '';
      if (incoming) combined.soul.soft = [existing, incoming].filter(Boolean).join('\n');
    }
  }
  return combined;
}

module.exports = { listRuleFiles, readRuleFile, writeRuleFile, deleteRuleFile, combineRuleFiles, RULES_DIR };
