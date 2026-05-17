// @ts-check

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-handoffs-'));
process.env.CE_ROOT = tmpRoot;

const {
  HANDOFFS_DIR,
  ARCHIVE_DIR,
  createHandoff,
  listHandoffs,
  listArchived,
  getHandoff,
  updateHandoff,
  restoreHandoff,
  purgeHandoff,
} = require('../server/lib/handoffs');
const { PROJECT_HANDOFF_RELATIVE, syncProjectHandoff } = require('../server/lib/handoff-project-sync');
const { parseLegacyHandoff, migrateLegacyHandoff } = require('../server/lib/handoff-migration');

(async () => {
  const active = createHandoff({
    title: 'Thread resume',
    thread_tag: 'thread-resume',
    body: 'Continue from the mocked thread state.',
  });
  assert.strictEqual(active.ok, true, 'expected thread handoff to create');
  assert.strictEqual(active.handoff.type, 'thread');
  assert.strictEqual(active.handoff.slug, 'thread-resume');
  assert.strictEqual(listHandoffs().length, 1, 'expected active handoff in list');

  const archived = fs.readFileSync(path.join(HANDOFFS_DIR, 'thread-resume.md'), 'utf8');
  fs.writeFileSync(
    path.join(HANDOFFS_DIR, 'thread-resume.md'),
    archived.replace(/last_touched: .+/, 'last_touched: 2020-01-01T00:00:00.000Z'),
    'utf8',
  );
  assert.strictEqual(listHandoffs().length, 0, 'idle thread handoff should auto-archive');
  assert.strictEqual(listArchived().length, 1, 'archived list should include stale thread handoff');

  const restored = await restoreHandoff('thread-resume');
  assert.strictEqual(restored.ok, true, 'expected archived handoff to restore');
  assert.strictEqual(listHandoffs().length, 1, 'restored handoff should be active again');

  const dual = createHandoff({
    title: 'Dual stale thread',
    repo: tmpRoot,
    thread_tag: 'dual-stale-thread',
    body: 'A dual-bound handoff should archive when the thread is idle.',
  });
  assert.strictEqual(dual.ok, true, 'expected dual handoff to create against existing directory');
  const dualPath = path.join(HANDOFFS_DIR, 'dual-stale-thread.md');
  fs.writeFileSync(
    dualPath,
    fs.readFileSync(dualPath, 'utf8').replace(/last_touched: .+/, 'last_touched: 2020-01-01T00:00:00.000Z'),
    'utf8',
  );
  listHandoffs();
  assert(
    fs.existsSync(path.join(ARCHIVE_DIR, 'dual-stale-thread.md')),
    'dual-bound handoff should archive when thread is idle even if commit count is unavailable',
  );

  const purged = await purgeHandoff('dual-stale-thread');
  assert.strictEqual(purged.ok, true, 'expected purge of archived handoff');
  assert(!fs.existsSync(path.join(ARCHIVE_DIR, 'dual-stale-thread.md')), 'purged handoff should be deleted');

  const repoDir = path.join(tmpRoot, 'repo');
  fs.mkdirSync(repoDir);
  /** @param {string[]} args */
  const git = (args) => execFileSync('git', args, { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] });
  git(['init']);
  git(['config', 'user.email', 'context-engine@example.test']);
  git(['config', 'user.name', 'Context Engine Test']);
  fs.writeFileSync(path.join(repoDir, 'notes.txt'), 'baseline\n', 'utf8');
  git(['add', 'notes.txt']);
  git(['commit', '-m', 'baseline']);
  const project = createHandoff({
    title: 'Project timeline',
    repo: repoDir,
    thread_tag: 'project-timeline',
    body: 'Track commits made after the handoff was written.',
  });
  assert.strictEqual(project.ok, true, 'expected project handoff to create against git repo');
  fs.appendFileSync(path.join(repoDir, 'notes.txt'), 'first\n', 'utf8');
  git(['add', 'notes.txt']);
  git(['commit', '-m', 'first change']);
  fs.appendFileSync(path.join(repoDir, 'notes.txt'), 'second\n', 'utf8');
  git(['add', 'notes.txt']);
  git(['commit', '-m', 'second change']);
  const timelineHandoff = listHandoffs().find((handoff) => handoff.slug === 'project-timeline');
  assert(timelineHandoff, 'expected project timeline handoff to stay active under commit threshold');
  assert.strictEqual(
    timelineHandoff.staleness.commits_past_head,
    2,
    'expected two commits past handoff head',
  );

  // Restore-doesn't-re-archive regression: archive a project handoff via the
  // commit threshold, then restore. The previous bug left head_sha pointing
  // at the pre-archive sha so the next listHandoffs() would immediately re-
  // archive on the same trip. Restore should refresh head_sha so the counter
  // resets and the entry stays active.
  const projectArchiveTarget = listHandoffs().find((h) => h.slug === 'project-timeline');
  assert(projectArchiveTarget, 'project handoff should exist before forced archive');
  const archiveResult = await require('../server/lib/handoffs').archiveHandoff('project-timeline');
  assert.strictEqual(archiveResult.ok, true, 'project handoff should archive on demand');
  // Advance the repo so commits_past_head against the old sha is > threshold.
  for (let i = 0; i < 6; i++) {
    fs.appendFileSync(path.join(repoDir, 'notes.txt'), `extra-${i}\n`, 'utf8');
    git(['add', 'notes.txt']);
    git(['commit', '-m', `extra ${i}`]);
  }
  const restoredProject = await restoreHandoff('project-timeline');
  assert.strictEqual(restoredProject.ok, true, 'archived project handoff should restore');
  // After restore + auto-sweep, the handoff must still be active (i.e. head_sha
  // was refreshed; the commit counter is now zero against the new head).
  const afterRestoreList = listHandoffs().map((h) => h.slug);
  assert(
    afterRestoreList.includes('project-timeline'),
    'restored project handoff should stay active — head_sha must be refreshed on restore',
  );
  const refreshed = listHandoffs().find((h) => h.slug === 'project-timeline');
  assert(refreshed, 'restored project handoff should appear in active list');
  assert.strictEqual(
    refreshed.staleness.commits_past_head,
    0,
    'restored project handoff should report 0 commits past head',
  );

  assert.strictEqual(timelineHandoff.staleness.commit_timeline.length, 2, 'expected bounded commit timeline');
  const latestCommit = timelineHandoff.staleness.commit_timeline[0];
  assert(latestCommit, 'expected at least one commit in timeline');
  assert.strictEqual(latestCommit.subject, 'second change');
  assert(latestCommit.short_sha, 'expected short sha in commit timeline');

  const projectHandoffFile = path.join(repoDir, PROJECT_HANDOFF_RELATIVE);
  fs.mkdirSync(path.dirname(projectHandoffFile), { recursive: true });
  fs.writeFileSync(
    projectHandoffFile,
    [
      '---',
      'title: Host-written checkpoint',
      'thread_tag: host-sync',
      '---',
      '# Current state',
      '',
      'The host wrote this handoff inside the project directory.',
      '',
      '## Next',
      '',
      'Context Engine should pull it into managed handoffs.',
    ].join('\n'),
    'utf8',
  );
  const synced = await syncProjectHandoff(repoDir);
  assert.strictEqual(synced.ok, true, 'expected project handoff file to sync');
  assert.strictEqual(synced.created, true, 'expected first project file sync to create a handoff');
  assert.strictEqual(synced.handoff.thread_tag, 'host-sync');
  assert(synced.handoff.body.includes('Current state'), 'expected synced body from project file');
  fs.writeFileSync(
    projectHandoffFile,
    [
      '---',
      'title: LLM should not overwrite UI title',
      'thread_tag: host-sync',
      '---',
      '# Updated by host',
      '',
      'Second sync should update the body only.',
    ].join('\n'),
    'utf8',
  );
  const resynced = await syncProjectHandoff(repoDir);
  assert.strictEqual(resynced.ok, true, 'expected project handoff file to resync');
  assert.strictEqual(resynced.created, false, 'expected second project file sync to update existing handoff');
  assert.strictEqual(
    resynced.handoff.title,
    'Host-written checkpoint',
    'existing UI title should be preserved',
  );
  assert(resynced.handoff.body.includes('Second sync'), 'expected synced body to update');

  const appJs = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.js'), 'utf8');
  const handoffsUi = fs.readFileSync(path.join(__dirname, '..', 'ui', 'handoffs.js'), 'utf8');
  assert(appJs.includes("name === 'handoffs'"), 'switchTab should handle Handoffs activation');
  assert(appJs.includes('HandoffsTab.ensureLoaded'), 'Handoffs tab activation should retry load');
  assert(handoffsUi.includes('ensureLoaded'), 'HandoffsTab should expose an idempotent loader');
  assert(
    handoffsUi.includes('renderHandoffTimeline'),
    'Handoffs detail should render body as timeline cards',
  );
  assert(
    handoffsUi.includes('handoff-edit-body'),
    'Handoffs detail should expose a body textarea so users can write the handoff prose themselves',
  );
  assert(
    handoffsUi.includes('handoff-modal-body'),
    'Handoffs create modal should expose a body textarea so the feature is usable end-to-end from the GUI',
  );

  // ---- getHandoff ----

  // GIVEN an existing active handoff
  const foundActive = getHandoff('project-timeline');
  assert.ok(foundActive, 'getHandoff returns handoff for existing slug');
  assert.strictEqual(foundActive.slug, 'project-timeline', 'getHandoff returns correct slug');

  // GIVEN a non-existent handoff
  const notFound = getHandoff('no-such-handoff');
  assert.strictEqual(notFound, null, 'getHandoff returns null for unknown slug');

  // GIVEN a path-traversal slug
  const traversal = getHandoff('../../etc/passwd');
  assert.strictEqual(traversal, null, 'getHandoff returns null for path-traversal slug');

  // ---- updateHandoff ----

  // GIVEN an active handoff
  createHandoff({ title: 'Update Target', thread_tag: 'update-target', body: 'Original body.' });
  // WHEN we update the title
  const titleUpdate = await updateHandoff('update-target', { title: 'Updated Title' });
  assert.strictEqual(titleUpdate.ok, true, 'updateHandoff succeeds for title');
  assert.strictEqual(titleUpdate.handoff.title, 'Updated Title', 'title is updated');
  // AND slug does not change
  assert.strictEqual(titleUpdate.handoff.slug, 'update-target', 'slug stays same after title update');

  // WHEN we update the body
  const bodyUpdate = await updateHandoff('update-target', { body: 'New body content.' });
  assert.strictEqual(bodyUpdate.ok, true, 'updateHandoff succeeds for body');
  assert.ok(bodyUpdate.handoff.body.includes('New body content'), 'body is updated');

  // WHEN we try to update a non-existent handoff
  const updateMiss = await updateHandoff('nonexistent-slug', { title: 'X' });
  assert.strictEqual(updateMiss.ok, false, 'updateHandoff fails for non-existent slug');

  // WHEN we try to update with path-traversal slug
  const updateTraversal = await updateHandoff('../../etc/passwd', { title: 'X' });
  assert.strictEqual(updateTraversal.ok, false, 'updateHandoff rejects path-traversal slug');

  // ---- createHandoff slug collision ----

  createHandoff({ title: 'Collision Test', thread_tag: 'collision-test', body: 'First.' });
  const collision = createHandoff({
    title: 'Collision Test',
    thread_tag: 'collision-test-2',
    body: 'Second.',
  });
  assert.strictEqual(collision.ok, true, 'createHandoff succeeds when slug collides');
  assert.ok(collision.handoff.slug.startsWith('collision-test'), 'collision slug has prefix');
  assert.notStrictEqual(collision.handoff.slug, 'collision-test', 'collision slug has suffix');

  // ---- createHandoff uses tag as slug seed when present ----

  const tagSlug = createHandoff({
    title: 'Title Different',
    thread_tag: 'tag-based-slug',
    body: 'Tag slug.',
  });
  assert.strictEqual(tagSlug.ok, true, 'createHandoff with thread_tag succeeds');
  assert.strictEqual(tagSlug.handoff.slug, 'tag-based-slug', 'slug derives from thread_tag when present');

  // ---- createHandoff without title ----

  const noTitle = createHandoff({ title: '', body: 'No title.' });
  assert.strictEqual(noTitle.ok, false, 'createHandoff fails with empty title');
  assert.strictEqual(noTitle.error, 'title is required', 'error mentions title');

  // ---- createHandoff with non-directory repo ----

  const badRepo = createHandoff({ title: 'Bad Repo', repo: '/nonexistent/path/xyz', body: 'Bad repo.' });
  assert.strictEqual(badRepo.ok, false, 'createHandoff fails with nonexistent repo path');

  const legacySource = path.join(tmpRoot, 'llm-handoff.md');
  fs.writeFileSync(
    legacySource,
    [
      '# LLM Handoff',
      '',
      '## Last session',
      '',
      '**2026-05-12 Current feature** - Continue wiring the new managed surface.',
      '',
      'Details stay with the first parsed entry.',
      '',
      '**2026-05-10 Older work** - Preserve this in archive.',
      '',
      'Older detail body.',
      '',
      '## Open threads',
      '',
      '- This section is not a dated legacy handoff entry.',
      '',
    ].join('\n'),
    'utf8',
  );
  const parsedLegacy = parseLegacyHandoff(fs.readFileSync(legacySource, 'utf8'));
  assert.strictEqual(parsedLegacy.length, 2, 'expected two dated legacy entries');
  const firstLegacy = parsedLegacy[0];
  assert(firstLegacy, 'expected first parsed legacy entry');
  assert.strictEqual(firstLegacy.title, 'Current feature');
  assert(firstLegacy.body.includes('Details stay'), 'expected body continuation to stay with entry');

  const migrated = await migrateLegacyHandoff({ sourceFile: legacySource, repo: tmpRoot, keepActive: 1 });
  assert.strictEqual(migrated.ok, true, 'expected legacy migration to succeed');
  assert.strictEqual(migrated.imported, 2, 'expected two imported legacy entries');
  assert.strictEqual(migrated.active, 1, 'expected newest legacy entry to stay active');
  assert.strictEqual(migrated.archived, 1, 'expected older legacy entry to archive');
  assert(fs.existsSync(path.join(HANDOFFS_DIR, 'current-feature.md')));
  assert(fs.existsSync(path.join(ARCHIVE_DIR, 'older-work.md')));

  console.log('handoffs smoke ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
