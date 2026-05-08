// compile-markup.js -- Outputs tab markup. Structured around the v4 product
// shape: CE is a background broker; the runtime bridge (MCP) is primary, the
// vector index is its prerequisite, and compiled fallback files are tucked
// behind a "show advanced" toggle for hosts that don't speak MCP.

(() => {
  const host = document.getElementById('compile-tab');
  if (!host) return;

  host.innerHTML = `
    <div class="simple-page">
      <div class="simple-inner wide">

        <section class="compile-card mcp-host-card">
          <div class="compile-card-head">
            <div>
              <span class="compile-kicker">Runtime bridge</span>
              <h3>Connect host apps</h3>
            </div>
            <button class="fb small" onclick="CompileTab.refreshMcpHosts()">Refresh</button>
          </div>
          <div id="mcp-hosts-list" class="mcp-hosts-list"></div>
        </section>

        <section class="compile-card readiness-card">
          <div id="compile-readiness"></div>
        </section>

        <section class="compile-card index-card">
          <div class="compile-card-head">
            <div>
              <span class="compile-kicker">Prerequisite</span>
              <h3>Vector index</h3>
            </div>
            <div class="compile-card-actions">
              <button class="fb small" onclick="CompileTab.refreshIndexStatus()">Refresh</button>
              <button class="save-btn small" onclick="CompileTab.buildIndex()">Build / rebuild</button>
            </div>
          </div>
          <div id="compile-index-status"></div>
        </section>

        <details class="compile-card fallback-card" id="compile-fallback-card">
          <summary class="compile-card-head fallback-summary">
            <div>
              <span class="compile-kicker">Optional</span>
              <h3>File fallback for non-MCP hosts</h3>
            </div>
            <span class="fallback-hint">Project-file outputs for Cursor, Copilot, AGENTS.md and similar.</span>
          </summary>
          <div class="fallback-body">
            <div class="fallback-toolbar">
              <div>
                <strong>Compiled file targets</strong>
                <div id="compile-fallback-summary" class="fallback-summary-meta"></div>
              </div>
              <div class="fallback-actions">
                <button class="save-btn" onclick="CompileTab.deployAllAvailable()">Update writable files</button>
                <button class="fb" onclick="CompileTab.preview()">Preview project files</button>
              </div>
            </div>
            <div id="compile-tools-grid" class="compile-tools-grid"></div>
            <section class="compile-card compile-card-inner">
              <div class="compile-card-head">
                <div>
                  <span class="compile-kicker">Projects</span>
                  <h3>Workspace targets</h3>
                </div>
                <button class="save-btn small" onclick="CompileTab.compileAllWorkspaces()">Compile all</button>
              </div>
              <div id="compile-workspaces-list"></div>
              <div class="compile-ws-add">
                <input
                  id="ws-path-input"
                  class="add-input"
                  type="text"
                  placeholder="E:\\Projects\\my-app"
                  onkeypress="if (event.key === 'Enter') CompileTab.addWorkspace();"
                />
                <input id="ws-label-input" class="add-input compile-label-input" type="text" placeholder="Label" />
                <button class="add-btn" onclick="CompileTab.addWorkspace()">Add</button>
              </div>
            </section>
            <div id="compile-summary" class="compile-summary"></div>
            <section class="compile-card compile-preview-card" id="compile-preview-card" hidden>
              <div class="compile-card-head">
                <div>
                  <span class="compile-kicker">Preview</span>
                  <h3>Generated output</h3>
                </div>
              </div>
              <div id="compile-preview-tabs" class="compile-preview-tabs"></div>
              <pre class="context-preview compile-preview-content" id="compile-preview-content"></pre>
            </section>
          </div>
        </details>

      </div>
    </div>

    <div class="modal-overlay" id="mcp-host-modal-overlay" onclick="CompileTab.closeHostConfig(event)">
      <section class="memory-modal mcp-host-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-host-modal-title">
        <div class="memory-modal-head">
          <h3 id="mcp-host-modal-title">Configure host</h3>
          <button class="icon-btn" onclick="CompileTab.closeHostConfig()" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="memory-modal-body" id="mcp-host-modal-body"></div>
        <div class="memory-modal-actions" id="mcp-host-modal-actions"></div>
      </section>
    </div>
  `;
})();
