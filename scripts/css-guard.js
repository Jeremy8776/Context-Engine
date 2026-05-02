// @ts-check

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STYLE_ROOT = path.join(ROOT, 'ui', 'styles');
const BANNED_PATTERNS = [
  {
    label: 'Never use !important in CSS',
    regex: /!important\b/g,
  },
  {
    label: 'Raw CSS color literals belong in ui/styles/tokens.css',
    regex: /#[0-9a-fA-F]{3,8}\b|rgba\([^)]*\)/g,
    allowTokens: true,
  },
];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectCssFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectCssFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.css')) files.push(fullPath);
  }
  return files;
}

/**
 * @param {string} text
 * @param {number} index
 */
function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

const failures = [];

for (const file of collectCssFiles(STYLE_ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.allowTokens && rel.replace(/\\/g, '/') === 'ui/styles/tokens.css') continue;
    for (const match of text.matchAll(pattern.regex)) {
      failures.push(`${rel}:${lineNumberAt(text, match.index || 0)} ${pattern.label}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('css guard ok');
}
