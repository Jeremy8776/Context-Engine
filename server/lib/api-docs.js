// @ts-check

/** @param {Array<{ method: string, path: string, description: string }>} extra */
function apiDocs(extra = []) {
  return {
    version: '0.2.0',
    endpoints: [
      { method: 'GET', path: '/api/skills', description: 'List all discovered skills' },
      {
        method: 'GET',
        path: '/api/skills/:id',
        description: 'Get one skill (record + body + section index). Optional ?section= for a slice.',
      },
      { method: 'GET', path: '/api/memory', description: 'Get memory entries' },
      { method: 'POST', path: '/api/memory', description: 'Update memory (validated)' },
      { method: 'GET', path: '/api/rules', description: 'Get rules configuration' },
      { method: 'POST', path: '/api/rules', description: 'Update rules (validated)' },
      { method: 'GET', path: '/api/states', description: 'Get skill toggle states' },
      { method: 'POST', path: '/api/states', description: 'Update states + regenerate (transactional)' },
      { method: 'GET', path: '/api/context-md', description: 'Get CONTEXT.md content + budget' },
      { method: 'POST', path: '/api/context-md', description: 'Force-regenerate CONTEXT.md' },
      { method: 'GET', path: '/api/compile/targets', description: 'List available compile targets' },
      { method: 'POST', path: '/api/compile/preview', description: 'Preview compiled output' },
      { method: 'POST', path: '/api/compile', description: 'Compile and write files to disk' },
      { method: 'GET', path: '/api/health', description: 'Skill health check + budget' },
      { method: 'GET', path: '/api/backups', description: 'List backup snapshots' },
      { method: 'POST', path: '/api/backups', description: 'Create backup snapshot' },
      { method: 'POST', path: '/api/restore', description: 'Restore from backup' },
      { method: 'GET', path: '/api/session-log', description: 'Get activity log' },
      { method: 'GET', path: '/api/modes', description: 'List mode presets' },
      { method: 'POST', path: '/api/modes/apply', description: 'Apply mode preset (transactional)' },
      ...extra,
      { method: 'GET', path: '/api/mcp/hosts', description: 'List MCP host config status and snippets' },
      {
        method: 'POST',
        path: '/api/mcp/hosts/install',
        description: 'Safely install Context Engine MCP config for one supported host',
      },
      { method: 'GET', path: '/api/tools/detect', description: 'Auto-detect installed AI tools' },
      {
        method: 'POST',
        path: '/api/tools/install-global',
        description: 'Install compiled context to global tool paths',
      },
      { method: 'GET', path: '/api/workspaces', description: 'List registered project workspaces' },
      { method: 'POST', path: '/api/workspaces', description: 'Add or remove a workspace' },
      {
        method: 'POST',
        path: '/api/workspaces/compile',
        description: 'Compile into one or all workspaces',
      },
    ],
  };
}

module.exports = { apiDocs };
