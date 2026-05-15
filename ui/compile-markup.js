// @ts-check

// compile-markup.js -- Connections tab markup. CE is a background broker; this
// page shows where its shared handoffs, memory, skills, and rules can sync.

(() => {
  const host = document.getElementById('compile-tab');
  if (!host) return;

  host.innerHTML = `
    <div class="simple-page">
      <div class="simple-inner wide">

        <section class="connections-host-section mcp-host-card">
          <div class="compile-card-head connections-host-head">
            <div id="compile-connection-status"></div>
            <button class="fb small" onclick="CompileTab.refreshConnections()">Re-check hosts</button>
          </div>
          <div id="mcp-hosts-list" class="mcp-hosts-list"></div>
        </section>

        <section class="connections-host-section mcp-host-card" id="skill-sources-section">
          <div class="compile-card-head connections-host-head">
            <div>
              <h2 class="skill-sources-title">Skill sources</h2>
              <p class="skill-sources-subtitle">Folders Context Engine reads SKILL.md files from. Link external trees read-only so the same continuity layer can follow work across host apps.</p>
            </div>
            <button class="fb small" onclick="SkillSourcesPanel.refresh()">Re-scan</button>
          </div>
          <div id="skill-sources-panel"></div>
        </section>

      </div>
    </div>
  `;
})();
