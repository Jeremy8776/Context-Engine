// @ts-check

// compile-markup.js -- Connections tab markup. CE is a background broker; this
// page shows where its shared skills, memory, and rules can sync.

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

      </div>
    </div>
  `;
})();