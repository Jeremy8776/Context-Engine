#!/usr/bin/env node
// @ts-check

const path = require('path');
const { migrateLegacyHandoff } = require('../server/lib/handoff-migration');
const { createHandoff, getHandoff } = require('../server/lib/handoffs');

const APP_DIR = path.resolve(__dirname, '..');
const sourceFile = path.join(APP_DIR, 'docs', 'llm-handoff.md');
const keepActiveArg = process.argv.find((arg) => arg.startsWith('--keep-active='));
const keepActive = keepActiveArg ? Number(keepActiveArg.split('=')[1]) || 0 : 0;

void (async () => {
const result = await migrateLegacyHandoff({
  sourceFile,
  repo: APP_DIR,
  keepActive,
});

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

const existingCurrent = getHandoff('handoff-feature');
let currentSlug = existingCurrent?.slug || null;
if (!currentSlug) {
  const current = createHandoff({
    title: 'Handoffs feature implementation',
    repo: APP_DIR,
    thread_tag: 'handoff-feature',
    body: [
      'Managed Handoffs backend, MCP bridge, admin tab, and legacy migration are in flight.',
      '',
      'Implemented so far:',
      '- data/handoffs storage with active/archive lifecycle',
      '- /api/handoffs routes split into server/lib/handoff-routes.js',
      '- context_engine_handoffs across stdio, HTTP, and MCPB transports',
      '- Handoffs admin tab with active/archive views, side-panel edit, create modal, restore, and purge',
      '- legacy docs/llm-handoff.md parser/importer',
      '',
      'Verification already run: test:handoffs, typecheck, lint, lint:css, smoke, smoke:mcp, smoke:mcp:http, smoke:mcpb, diff --check.',
      'Preview/render validation is intentionally left for Jeremy per request.',
    ].join('\n'),
  });
  currentSlug = current.ok ? current.handoff.slug : null;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      active: result.active + (currentSlug ? 1 : 0),
      archived: result.archived,
      current: currentSlug,
    },
    null,
    2,
  ),
);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
