// @ts-check

/** @param {Array<{ method: string, path: string, description: string }>} extra */
function apiDocs(extra = []) {
  return {
    version: '0.3.0',
    endpoints: [
      { method: 'GET', path: '/api/skills', description: 'List all discovered skills' },
      {
        method: 'GET',
        path: '/api/skills/:id',
        description: 'Get one skill (record + body + section index). Optional ?section= for a slice.',
      },
      { method: 'POST', path: '/api/skills/ingest', description: 'Clone a skill repo into skills/ingested (allowlisted hosts only)' },
      { method: 'GET', path: '/api/skills/ingest/:jobId', description: 'Poll an in-flight ingest job' },
      { method: 'POST', path: '/api/skills/parse', description: 'LLM-parse skill descriptions for unparsed entries' },
      { method: 'POST', path: '/api/skills/organise', description: 'Tidy skill library (move/remove/review)' },
      { method: 'POST', path: '/api/skills/review-similar', description: 'LLM review of similar skills' },
      // Skill sources (Phase 1 + 2 — Link + Import + Sync)
      { method: 'GET', path: '/api/skill-sources', description: 'List registered skill sources + implicit internal' },
      { method: 'POST', path: '/api/skill-sources', description: 'Link an external skill directory' },
      { method: 'DELETE', path: '/api/skill-sources/:id', description: 'Unlink a source (manifest dropped; imported tree kept)' },
      { method: 'GET', path: '/api/skill-sources/scan', description: 'Probe known host-app skill paths' },
      { method: 'POST', path: '/api/skill-sources/:id/import', description: 'Hard-link or copy a source into <CE_ROOT>/skills/imported/<id>/' },
      { method: 'GET', path: '/api/skill-sources/:id/sync', description: 'Diff source vs imported tree (added/removed/modified/localEdits/conflicts)' },
      { method: 'POST', path: '/api/skill-sources/:id/sync/apply', description: 'Apply sync diff. Body { mode: "append" | "overwrite" }' },
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
      { method: 'GET', path: '/api/onboarding', description: 'First-run discovery summary (hosts + tools + context + index)' },
      { method: 'POST', path: '/api/onboarding/complete', description: 'Mark onboarding complete (suppresses re-prompt)' },
      { method: 'POST', path: '/api/onboarding/reset', description: 'Re-arm the onboarding flow for the next launch' },
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
      { method: 'GET', path: '/api/keys/status', description: 'Check which API keys are configured' },
      { method: 'POST', path: '/api/keys', description: 'Save an encrypted API key' },
      { method: 'DELETE', path: '/api/keys', description: 'Remove an encrypted API key' },
      { method: 'GET', path: '/api/llm/ollama-models', description: 'List local Ollama models if reachable' },
      { method: 'GET', path: '/api/app-version', description: 'Report installed app version and channel' },
    ],
  };
}

module.exports = { apiDocs };
