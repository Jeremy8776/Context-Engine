// context-flow.js -- live dashboard visualization for skills/memory/rules -> tools.

const ContextFlow = (() => {
  const fallbackTools = [
    { id: 'claude', label: 'Claude Code', glyph: 'CC', installed: true },
    { id: 'cursor', label: 'Cursor', glyph: 'CR', installed: true },
    { id: 'copilot', label: 'Copilot', glyph: 'GH', installed: false },
    { id: 'codex', label: 'Codex', glyph: 'CX', installed: true },
    { id: 'windsurf', label: 'Windsurf', glyph: 'WS', installed: false },
    { id: 'aider', label: 'Aider', glyph: 'AD', installed: false },
    { id: 'junie', label: 'Junie', glyph: 'JB', installed: false },
    { id: 'ollama', label: 'Ollama', glyph: 'OL', installed: false },
  ];

  async function init() {
    const host = document.getElementById('flow-stage');
    if (!host) return;
    let detected = null;
    try { detected = await DS.detectTools(); } catch {}
    render(host, normalizeTools(detected));
  }

  function normalizeTools(detected) {
    if (!detected || typeof detected !== 'object') return fallbackTools;
    return Object.entries(detected).slice(0, 10).map(([id, t]) => ({
      id,
      label: t.label || id,
      glyph: initials(t.label || id),
      installed: !!t.installed,
    }));
  }

  function initials(label) {
    return label.split(/[\s()/.-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  function render(host, tools) {
    const activeSkills = SKILL_DATA.filter(s => SS.active(s.id)).length;
    const memory = MS.getData();
    const memories = Array.isArray(memory.entries) ? memory.entries.length : 0;
    const rules = RS.get();
    const ruleBlocks = ['coding', 'general', 'soul'].filter(k => rules[k]).length || 3;
    const connected = tools.filter(t => t.installed).length;

    const labels = [
      { name: 'Skills', count: activeSkills, x: 54, y: 68, cls: 's1' },
      { name: 'Memory', count: memories, x: 54, y: 142, cls: 's2' },
      { name: 'Rules', count: ruleBlocks, x: 54, y: 216, cls: 's3' },
    ];
    const nodes = tools.map((tool, i) => {
      const spread = tools.length > 1 ? i / (tools.length - 1) : 0.5;
      const y = 36 + spread * 216;
      const x = 850 + Math.sin(spread * Math.PI) * 58;
      return { ...tool, x, y };
    });

    host.innerHTML = `
      <div class="flow-metrics">
        <span><b>${activeSkills}</b> skills</span>
        <span><b>${memories}</b> memories</span>
        <span><b>${ruleBlocks}</b> rule blocks</span>
        <span><b>${connected}</b> connected tools</span>
      </div>
      <svg class="flow-svg" viewBox="0 0 1040 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="flow-line" x1="0" x2="1">
            <stop offset="0" stop-color="var(--accent-hi)" stop-opacity="0"/>
            <stop offset="0.5" stop-color="var(--accent-hi)" stop-opacity="0.45"/>
            <stop offset="1" stop-color="var(--iri-3)" stop-opacity="0"/>
          </linearGradient>
          <radialGradient id="flow-hub">
            <stop offset="0" stop-color="var(--accent-hi)" stop-opacity="0.95"/>
            <stop offset="0.55" stop-color="var(--accent)" stop-opacity="0.46"/>
            <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
          </radialGradient>
        </defs>
        ${labels.map((s, i) => sourceMarkup(s, i)).join('')}
        ${labels.map(s => `<path id="src-${s.cls}" class="flow-line" d="M ${s.x + 34} ${s.y} C 250 ${s.y}, 340 140, 456 140"/>`).join('')}
        <circle class="flow-hub-glow" cx="456" cy="140" r="70"/>
        <circle class="flow-hub-ring" cx="456" cy="140" r="36"/>
        <circle class="flow-hub-core" cx="456" cy="140" r="24"/>
        <text class="flow-hub-text" x="456" y="138" text-anchor="middle">CTX</text>
        <text class="flow-hub-sub" x="456" y="152" text-anchor="middle">.md</text>
        ${nodes.map((n, i) => toolPathMarkup(n, i)).join('')}
        ${nodes.map(toolNodeMarkup).join('')}
        ${particleMarkup(labels, nodes)}
      </svg>
    `;
  }

  function sourceMarkup(s) {
    return `
      <g class="flow-source ${s.cls}">
        <circle cx="${s.x}" cy="${s.y}" r="24"/>
        <circle class="flow-source-dot" cx="${s.x}" cy="${s.y}" r="6"/>
        <text class="flow-source-label" x="${s.x + 42}" y="${s.y - 5}">${esc(s.name)}</text>
        <text class="flow-source-count" x="${s.x + 42}" y="${s.y + 13}">${s.count} active</text>
      </g>
    `;
  }

  function toolPathMarkup(n, i) {
    return `<path id="tool-${i}" class="flow-line ${n.installed ? 'hot' : 'cold'}" d="M 480 140 C 610 140, 650 ${n.y}, ${n.x - 28} ${n.y}"/>`;
  }

  function toolNodeMarkup(n) {
    return `
      <g class="flow-tool ${n.installed ? 'installed' : ''}">
        <circle cx="${n.x}" cy="${n.y}" r="16"/>
        <text class="flow-tool-glyph" x="${n.x}" y="${n.y + 4}" text-anchor="middle">${esc(n.glyph)}</text>
        <text class="flow-tool-label" x="${n.x + 26}" y="${n.y + 4}">${esc(n.label)}</text>
      </g>
    `;
  }

  function particleMarkup(labels, nodes) {
    const particles = [];
    for (let i = 0; i < 18; i++) {
      const source = labels[i % labels.length];
      const toolIndex = i % nodes.length;
      const delay = (i * 0.42).toFixed(2);
      particles.push(`
        <circle class="flow-particle ${source.cls}" r="3">
          <animateMotion dur="6s" begin="${delay}s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear">
            <mpath href="#src-${source.cls}"/>
          </animateMotion>
        </circle>
        <circle class="flow-particle ${source.cls}" r="2.5">
          <animateMotion dur="6s" begin="${(Number(delay) + 3).toFixed(2)}s" repeatCount="indefinite">
            <mpath href="#tool-${toolIndex}"/>
          </animateMotion>
        </circle>
      `);
    }
    return particles.join('');
  }

  return { init };
})();
