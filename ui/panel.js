// @ts-check

// panel.js — shared slide-in side panel component

const SidePanel = (() => {
  const overlay = () => /** @type {HTMLElement} */ (document.getElementById('side-panel-overlay'));
  const panel = () => /** @type {HTMLElement} */ (document.getElementById('side-panel'));
  const titleEl = () => /** @type {HTMLElement} */ (document.getElementById('sp-title'));
  const body = () => /** @type {HTMLElement} */ (document.getElementById('sp-body'));
  /** @type {ReturnType<typeof setTimeout> | null} */
  let closeTimer = null;

  function measurePanelTop() {
    const activeTab = document.querySelector('.tab-panel.active');
    const content = activeTab?.querySelector(
      '.memory-card, .skill-row, .mode-card:not(.mode-card-ghost), .mcp-host-row, .memory-results, .skills-scroll, .modes-list, .mcp-hosts-list',
    );
    if (content) return Math.round(content.getBoundingClientRect().top);

    const toolbar = activeTab?.querySelector('.toolbar, .memory-toolbar, .modes-toolbar');
    if (toolbar) return Math.round(toolbar.getBoundingClientRect().bottom);

    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) return Math.round(navBrand.getBoundingClientRect().bottom);

    return 0;
  }

  /**
   * @param {string} title
   * @param {string} contentHTML
   */
  function open(title, contentHTML) {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    titleEl().textContent = title;
    body().innerHTML = contentHTML;
    panel().style.setProperty('--side-panel-top', `${measurePanelTop()}px`);
    document.body.classList.add('side-panel-active');
    overlay().classList.add('open');
    requestAnimationFrame(() => panel().classList.add('open'));
  }

  function close() {
    if (!isOpen() && !document.body.classList.contains('side-panel-active')) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel().classList.remove('open');
    overlay().classList.remove('open');
    document.body.classList.remove('side-panel-active');
    document.dispatchEvent(new CustomEvent('sidepanel:close'));
  }

  function isOpen() {
    return panel().classList.contains('open');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen };
})();