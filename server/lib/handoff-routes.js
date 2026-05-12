// @ts-check

const { body, json } = require('./http');
const {
  listHandoffs,
  listArchived: listArchivedHandoffs,
  getHandoff,
  createHandoff,
  updateHandoff,
  archiveHandoff,
  restoreHandoff,
  purgeHandoff,
} = require('./handoffs');
const { syncProjectHandoff } = require('./handoff-project-sync');

/** @param {unknown} value */
function stringField(value) {
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 */
async function handleHandoffRequest(req, res, url) {
  const p = url.pathname;

  if (p === '/api/handoffs' && req.method === 'GET') {
    return json(res, { handoffs: listHandoffs() });
  }

  if (p === '/api/handoffs/archive' && req.method === 'GET') {
    return json(res, { handoffs: listArchivedHandoffs() });
  }

  if (p === '/api/handoffs/sync-project' && req.method === 'POST') {
    const data = await body(req);
    const result = syncProjectHandoff(stringField(data?.repo) || '');
    if (!result.ok) return json(res, { ok: false, error: result.error, source: result.source }, 400);
    return json(res, { ok: true, handoff: result.handoff, source: result.source, created: result.created });
  }

  if (p === '/api/handoffs' && req.method === 'POST') {
    const data = await body(req);
    const result = createHandoff({
      title: stringField(data?.title) || '',
      body: stringField(data?.body),
      repo: stringField(data?.repo),
      thread_tag: stringField(data?.thread_tag),
    });
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true, handoff: result.handoff });
  }

  if (p.startsWith('/api/handoffs/') && p.endsWith('/archive') && req.method === 'POST') {
    const slug = decodeURIComponent(p.slice('/api/handoffs/'.length, -'/archive'.length));
    const result = archiveHandoff(slug);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true });
  }

  if (p.startsWith('/api/handoffs/') && p.endsWith('/restore') && req.method === 'POST') {
    const slug = decodeURIComponent(p.slice('/api/handoffs/'.length, -'/restore'.length));
    const result = restoreHandoff(slug);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true, handoff: result.handoff });
  }

  if (p.startsWith('/api/handoffs/') && p.endsWith('/purge') && req.method === 'POST') {
    const slug = decodeURIComponent(p.slice('/api/handoffs/'.length, -'/purge'.length));
    const result = purgeHandoff(slug);
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true });
  }

  if (p.startsWith('/api/handoffs/') && req.method === 'GET') {
    const slug = decodeURIComponent(p.replace('/api/handoffs/', ''));
    if (!slug || slug === 'archive') return null;
    const handoff = getHandoff(slug);
    if (!handoff) return json(res, { ok: false, error: 'Handoff not found' }, 404);
    return json(res, { ok: true, handoff });
  }

  if (p.startsWith('/api/handoffs/') && req.method === 'PATCH') {
    const slug = decodeURIComponent(p.replace('/api/handoffs/', ''));
    if (!slug) return json(res, { ok: false, error: 'slug is required' }, 400);
    const data = await body(req);
    const result = updateHandoff(slug, { title: stringField(data?.title), body: stringField(data?.body) });
    if (!result.ok) return json(res, { ok: false, error: result.error }, 400);
    return json(res, { ok: true, handoff: result.handoff });
  }

  return null;
}

function handoffRouteDocs() {
  return [
    { method: 'GET', path: '/api/handoffs', description: 'List active handoffs' },
    { method: 'GET', path: '/api/handoffs/archive', description: 'List archived handoffs' },
    {
      method: 'POST',
      path: '/api/handoffs/sync-project',
      description: 'Sync .context-engine/handoff.md from a project directory',
    },
    { method: 'POST', path: '/api/handoffs', description: 'Create a project or thread handoff' },
    { method: 'GET', path: '/api/handoffs/:slug', description: 'Get one handoff' },
    { method: 'PATCH', path: '/api/handoffs/:slug', description: 'Update a handoff title or body' },
    { method: 'POST', path: '/api/handoffs/:slug/archive', description: 'Archive a handoff' },
    { method: 'POST', path: '/api/handoffs/:slug/restore', description: 'Restore an archived handoff' },
    {
      method: 'POST',
      path: '/api/handoffs/:slug/purge',
      description: 'Permanently delete an archived handoff',
    },
  ];
}

module.exports = { handleHandoffRequest, handoffRouteDocs };
