// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'ui', 'assets', 'brand');
const ICONS_DIR = path.join(BRAND_DIR, 'icons');
const SOURCE = path.join(BRAND_DIR, 'icon.svg');

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICNS_TYPES = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10'],
]);

function runMagick(args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

function pngPath(size) {
  return path.join(ICONS_DIR, `${size}x${size}.png`);
}

function writeUInt32BE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function icnsBlock(type, data) {
  return Buffer.concat([Buffer.from(type), writeUInt32BE(data.length + 8), data]);
}

function buildIcns() {
  const blocks = [];
  for (const [size, type] of ICNS_TYPES) {
    blocks.push(icnsBlock(type, fs.readFileSync(pngPath(size))));
  }

  const length = 8 + blocks.reduce((sum, block) => sum + block.length, 0);
  return Buffer.concat([Buffer.from('icns'), writeUInt32BE(length), ...blocks]);
}

fs.mkdirSync(ICONS_DIR, { recursive: true });

runMagick([
  '-background',
  'none',
  '-density',
  '600',
  SOURCE,
  '-define',
  'icon:auto-resize=256,128,64,48,32,16',
  path.join(BRAND_DIR, 'icon.ico'),
]);

runMagick([
  '-background',
  'none',
  '-density',
  '600',
  SOURCE,
  '-resize',
  '512x512',
  path.join(BRAND_DIR, 'icon.png'),
]);

for (const size of PNG_SIZES) {
  runMagick(['-background', 'none', '-density', '600', SOURCE, '-resize', `${size}x${size}`, pngPath(size)]);
}

fs.writeFileSync(path.join(BRAND_DIR, 'icon.icns'), buildIcns());
console.log('Generated brand icons');