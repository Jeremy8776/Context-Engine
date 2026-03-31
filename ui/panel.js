// panel.js — shared slide-in side panel component

const SidePanel = (() => {
  const overlay = () => document.getElementById('side-panel-overlay');
  const panel   = () => document.getElementById('side-panel');
  const titleEl = () => document.getElementById('sp-title');
  const body    = () => document.getElementById('sp-body');

  function open(title, contentHTML) {
    titleEl().textContent = title;
    body().innerHTML = contentHTML;
    panel().classList.add('open');
    overlay().classList.add('open');
  }

  function close() {
    panel().classList.remove('open');
    overlay().classList.remove('open');
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
