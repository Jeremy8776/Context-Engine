// @ts-check
// Smoke test for skill-sources registry + import + sync lifecycle. Runs
// against a tmp CE_ROOT so it doesn't touch the dev install. Cross-volume
// import isn't exercised here — that path is OS/volume specific and would
// need a Windows-specific test runner; the hard-link + copy-fallback
// strategies share enough of the code that the link branch is the load-
// bearing case.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-skill-sources-'));
process.env.CE_ROOT = tmpRoot;
fs.mkdirSync(path.join(tmpRoot, 'data'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'skills'), { recursive: true });

const sourcesMod = require('../server/lib/skill-sources');
const importMod = require('../server/lib/skill-import');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-source-fixture-'));
fs.mkdirSync(path.join(fixture, 'alpha'));
fs.writeFileSync(
  path.join(fixture, 'alpha', 'SKILL.md'),
  '---\nname: alpha\n---\n# Alpha\nFirst skill body.\n',
  'utf8',
);
fs.mkdirSync(path.join(fixture, 'beta'));
fs.writeFileSync(
  path.join(fixture, 'beta', 'SKILL.md'),
  '---\nname: beta\n---\n# Beta\nSecond skill body.\n',
  'utf8',
);

void (async () => {
  // ---- addSource: positive + duplicate + denylist ----
  const linked = await sourcesMod.addSource({ path: fixture, label: 'Fixture' });
  assert.strictEqual(linked.ok, true, 'addSource should succeed for a fresh path');
  const sourceId = linked.source.id;
  assert.match(sourceId, /^[a-z0-9-]+$/, 'source id should be slug-shaped');

  const dup = await sourcesMod.addSource({ path: fixture, label: 'Fixture again' });
  assert.strictEqual(dup.ok, false, 'duplicate addSource should refuse');
  assert.match(String(dup.error), /already linked/i, 'duplicate error should mention "already linked"');

  // UNC / hostile paths
  const unc = await sourcesMod.addSource({ path: '\\\\evil\\share', label: 'unc' });
  assert.strictEqual(unc.ok, false, 'UNC path should be refused');

  // Inside SKILLS_DIR
  const inside = await sourcesMod.addSource({ path: path.join(tmpRoot, 'skills'), label: 'inside' });
  assert.strictEqual(inside.ok, false, 'path inside SKILLS_DIR should be refused');

  // ---- listSources ----
  const listed = sourcesMod.listSources();
  assert(listed.some((s) => s.id === 'internal'), 'listSources should always include the internal source');
  assert(listed.some((s) => s.id === sourceId), 'listSources should include the linked source');

  // ---- importSource ----
  const imported = await importMod.importSource(sourceId);
  assert.strictEqual(imported.ok, true, 'importSource should succeed against a fresh fixture');
  assert.strictEqual(imported.manifest.files.length, 2, 'manifest should record both SKILL.md files');
  assert(
    fs.existsSync(path.join(tmpRoot, 'skills', 'imported', sourceId, 'alpha', 'SKILL.md')),
    'imported tree should contain placed alpha/SKILL.md',
  );

  // Idempotency: re-import refuses while manifest exists.
  const reImport = await importMod.importSource(sourceId);
  assert.strictEqual(reImport.ok, false, 'second importSource should refuse without a manifest reset');

  // ---- computeSyncDiff: clean → mutate → diff ----
  const cleanDiff = importMod.computeSyncDiff(sourceId);
  assert(cleanDiff.ok, 'clean diff should succeed');
  assert.strictEqual(cleanDiff.diff.added.length, 0, 'clean diff: no added');
  assert.strictEqual(cleanDiff.diff.removed.length, 0, 'clean diff: no removed');

  // Add a new file to source.
  fs.mkdirSync(path.join(fixture, 'gamma'));
  fs.writeFileSync(
    path.join(fixture, 'gamma', 'SKILL.md'),
    '---\nname: gamma\n---\n# Gamma\n',
    'utf8',
  );
  const addedDiff = importMod.computeSyncDiff(sourceId);
  assert(addedDiff.ok, 'addedDiff should succeed');
  assert.strictEqual(addedDiff.diff.added.length, 1, 'diff should detect the new gamma file');
  const firstAdded = addedDiff.diff.added[0];
  assert(firstAdded && firstAdded.rel.includes('gamma/SKILL.md'), 'diff added entry should reference gamma path');

  // ---- applySyncDiff: append picks up added only ----
  const appended = await importMod.applySyncDiff(sourceId, 'append');
  assert.strictEqual(appended.ok, true);
  assert.strictEqual(appended.applied.added, 1, 'append should apply exactly one new file');
  assert(
    fs.existsSync(path.join(tmpRoot, 'skills', 'imported', sourceId, 'gamma', 'SKILL.md')),
    'gamma should land in the imported tree',
  );

  // Remove a file from source — overwrite should propagate the delete.
  fs.rmSync(path.join(fixture, 'beta'), { recursive: true, force: true });
  const removedDiff = importMod.computeSyncDiff(sourceId);
  assert(removedDiff.ok, 'removedDiff should succeed');
  assert.strictEqual(removedDiff.diff.removed.length, 1, 'diff should detect the removed beta file');

  const overwritten = await importMod.applySyncDiff(sourceId, 'overwrite');
  assert.strictEqual(overwritten.ok, true);
  assert.strictEqual(overwritten.applied.removed, 1, 'overwrite should propagate the source delete');
  assert(
    !fs.existsSync(path.join(tmpRoot, 'skills', 'imported', sourceId, 'beta', 'SKILL.md')),
    'beta should be gone from imported tree after overwrite',
  );

  const settled = importMod.computeSyncDiff(sourceId);
  assert(settled.ok, 'settled diff should succeed');
  assert.strictEqual(settled.diff.added.length, 0, 'no added after overwrite');
  assert.strictEqual(settled.diff.removed.length, 0, 'no removed after overwrite');

  // ---- removeSource: drops manifest, keeps imported tree ----
  const unlinked = await sourcesMod.removeSource(sourceId);
  assert.strictEqual(unlinked.ok, true);
  assert.strictEqual(
    importMod.readManifest(sourceId),
    null,
    'manifest should be forgotten after removeSource',
  );
  // Spec: imported dir is intentionally kept on unlink (user chose to
  // materialise those files; tearing them down would surprise).
  assert(
    fs.existsSync(path.join(tmpRoot, 'skills', 'imported', sourceId, 'alpha', 'SKILL.md')),
    'imported tree should survive unlink',
  );

  // Cleanup.
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log('skill-sources smoke ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
