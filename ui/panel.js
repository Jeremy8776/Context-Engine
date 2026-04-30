// panel.js — shared slide-in side panel component

const SidePanel = (() => {
  const overlay = () => document.getElementById('side-panel-overlay');
  const panel   = () => document.getElementById('side-panel');
  const titleEl = () => document.getElementById('sp-title');
  const body    = () => document.getElementById('sp-body');
  let closeTimer = null;
  const closeDelay = 420;

  function measurePanelTop() {
    const activeTab = document.querySelector('.tab-panel.active');
    const toolbar = activeTab?.querySelector('.toolbar');
    if (toolbar) return Math.round(toolbar.getBoundingClientRect().bottom);

    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) return Math.round(navBrand.getBoundingClientRect().bottom);

    return 0;
  }

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
    panel().classList.remove('open');
    overlay().classList.remove('open');
    document.dispatchEvent(new CustomEvent('sidepanel:close'));
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      document.body.classList.remove('side-panel-active');
      closeTimer = null;
    }, closeDelay);
  }

  function isOpen() {
    return panel().classList.contains('open');
  }

  document.addEventListener('click', e => {
    if (e.target.id === 'side-panel-overlay') close();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen };
})();
