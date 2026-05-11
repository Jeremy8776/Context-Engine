// @ts-nocheck — Path-A backlog: file in tsconfig include, opt out until incremental typing is done. See docs/llm-handoff.md.

function switchTab(name, btn) {
  if (
    typeof SidePanel !== 'undefined' &&
    (SidePanel.isOpen() || document.body.classList.contains('side-panel-active'))
  ) {
    SidePanel.close();
  }
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const panel = document.getElementById(name + '-tab');
  if (!panel) return;
  panel.style.display = 'flex';
  panel.offsetHeight;
  panel.classList.add('active');
  btn.classList.add('active');
  const crumb = document.getElementById('crumb-here');
  if (crumb) crumb.textContent = btn.dataset.label || btn.textContent.trim();
  if (name === 'modes' && typeof ModesTab !== 'undefined') {
    requestAnimationFrame(() => ModesTab.syncCreateShortcut?.());
  }
}
function switchTabByName(name) {
  const btn = document.querySelector(`.tab-btn[onclick*="'${name}'"]`);
  if (btn) btn.click();
}
function activateInitialTabFromHash() {
  const name = (location.hash || '').replace('#', '');
  if (!name) return;
  const btn = document.querySelector(`.tab-btn[onclick*="'${name}'"]`);
  if (btn) btn.click();
}
function setNavCollapsed(collapsed) {
  const navState = collapsed ? 'mini' : 'full';
  document.documentElement.dataset.nav = navState;
  document.querySelector('.app')?.setAttribute('data-nav', navState);
  const btn = document.getElementById('nav-toggle');
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
    btn.title = collapsed ? 'Expand navigation' : 'Collapse navigation';
  }
  try {
    localStorage.setItem('ce_nav_collapsed', collapsed ? '1' : '0');
  } catch {}
}
function initNavCollapse() {
  setNavCollapsed(document.documentElement.dataset.nav === 'mini');
}
function toggleNavCollapse() {
  setNavCollapsed(document.documentElement.dataset.nav !== 'mini');
}
function animateCount(el, target) {
  const dur = 700,
    t0 = performance.now();
  const isPercent = typeof target === 'string' && target.includes('%');
  const num = isPercent ? parseInt(target) : target;
  const suffix = isPercent ? '%' : '';
  const tick = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(num * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function renderHeroSparkline() {
  const host = document.getElementById('db-hero-spark');
  if (!host) return;
  // Ambient sparkline — 32 bars, randomized weighted envelope.
  // Kept as pure visual signal; can be wired to real history later.
  const bars = 32;
  const seed = Math.floor(Math.random() * 1000);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1);
    const envelope = Math.sin(t * Math.PI) * 0.8 + 0.2;
    const noise = Math.abs(Math.sin((i + seed) * 2.17)) * 0.45;
    const h = Math.max(4, Math.min(100, (envelope * 0.6 + noise * 0.5) * 100));
    const bar = document.createElement('span');
    bar.className = 'hero-spark-bar';
    bar.style.height = h + '%';
    bar.style.transitionDelay = i * 16 + 'ms';
    frag.appendChild(bar);
  }
  host.innerHTML = '';
  host.appendChild(frag);
}

async function boot() {
  const online = await ServerStatus.check();
  if (online) {
    await loadSkillData();
    await Promise.all([SS.loadFromServer(), MS.loadFromServer(), RS.loadFromServer()]);
  }
  SkillsTab.init();
  MemoryTab.init();
  ConfigTab.init();
  await ModesTab.init();
  if (typeof CompileTab !== 'undefined') await CompileTab.init();
  await DashboardTab.init();
  if (typeof ContextFlow !== 'undefined') ContextFlow.init();
  initNavCollapse();
  renderHeroSparkline();
  activateInitialTabFromHash();
  if (typeof Onboarding !== 'undefined') await Onboarding.init();
  document.getElementById('loader').classList.add('hidden');
}
boot();