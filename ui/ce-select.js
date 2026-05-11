// @ts-check

// ce-select.js — progressive enhancement that replaces native <select>
// dropdowns with a CSS-controllable listbox. Chromium renders the native
// option popup as an OS menu where :hover doesn't fire, so we can't theme
// the hover highlight. This component swaps the popup for a div listbox we
// fully control while keeping the <select> in the DOM for form / event
// compatibility (consumers still listen to `change` on the original element).
//
// Usage:
//   <select class="add-input" data-ce-select> ... </select>
//   CESelect.enhanceAll();   // call once after the select is in the DOM
//
// Or for a single element: CESelect.enhance(selectEl).

(function () {
  /** @type {WeakSet<HTMLSelectElement>} */
  const enhanced = new WeakSet();

  /** @param {HTMLSelectElement} select */
  function enhance(select) {
    if (!select || enhanced.has(select) || select.multiple) return;
    enhanced.add(select);

    const wrapper = document.createElement('div');
    wrapper.className = 'ce-select';
    select.parentNode?.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('ce-select-native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ce-select-trigger add-input';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'ce-select-label';
    trigger.appendChild(label);

    const chev = document.createElement('span');
    chev.className = 'ce-select-chev';
    chev.setAttribute('aria-hidden', 'true');
    trigger.appendChild(chev);

    // The list portals to document.body so it escapes any overflow:hidden
    // ancestor (e.g. modal bodies with overflow-y: auto) and doesn't have to
    // win a z-index race against arbitrary modal layers.
    const list = document.createElement('ul');
    list.className = 'ce-select-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    document.body.appendChild(list);

    wrapper.appendChild(trigger);

    /** @param {string} value */
    function setValue(value) {
      if (select.value === value) return;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function syncFromSelect() {
      const opt = select.options[select.selectedIndex];
      label.textContent = opt ? opt.textContent : '';
      list.innerHTML = '';
      Array.from(select.options).forEach((option, idx) => {
        const li = document.createElement('li');
        li.className = 'ce-select-option';
        li.setAttribute('role', 'option');
        li.dataset.value = option.value;
        li.textContent = option.textContent;
        if (idx === select.selectedIndex) li.classList.add('selected');
        if (option.disabled) li.classList.add('disabled');
        li.setAttribute('aria-selected', idx === select.selectedIndex ? 'true' : 'false');
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          if (option.disabled) return;
          setValue(option.value);
          close();
          trigger.focus();
        });
        list.appendChild(li);
      });
    }

    function positionList() {
      const rect = trigger.getBoundingClientRect();
      const margin = 6;
      const maxBelow = window.innerHeight - rect.bottom - margin;
      const maxAbove = rect.top - margin;
      // Flip upward when the popup wouldn't fit below.
      const idealHeight = Math.min(280, list.scrollHeight + 8);
      const openUpward = maxBelow < Math.min(idealHeight, 160) && maxAbove > maxBelow;
      const available = openUpward ? maxAbove : maxBelow;
      list.style.left = `${Math.round(rect.left)}px`;
      list.style.width = `${Math.round(rect.width)}px`;
      list.style.maxHeight = `${Math.max(120, Math.floor(available))}px`;
      if (openUpward) {
        list.style.top = '';
        list.style.bottom = `${Math.round(window.innerHeight - rect.top + margin - 4)}px`;
      } else {
        list.style.bottom = '';
        list.style.top = `${Math.round(rect.bottom + 4)}px`;
      }
    }

    function open() {
      if (!list.hidden) return;
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('ce-select-open');
      positionList();
      const selected = list.querySelector('.selected');
      if (selected instanceof HTMLElement) selected.scrollIntoView({ block: 'nearest' });
      document.addEventListener('mousedown', onDocMouseDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('scroll', positionList, true);
      window.addEventListener('resize', positionList, true);
    }

    function close() {
      if (list.hidden) return;
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      wrapper.classList.remove('ce-select-open');
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', positionList, true);
      window.removeEventListener('resize', positionList, true);
    }

    /** @param {MouseEvent} event */
    function onDocMouseDown(event) {
      if (!(event.target instanceof Node)) return;
      // The list is portaled to body, so check both the wrapper and the list.
      if (!wrapper.contains(event.target) && !list.contains(event.target)) close();
    }

    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        close();
        trigger.focus();
        return;
      }
      if (event.key === 'Tab') {
        close();
        return;
      }
      const focusable = Array.from(list.querySelectorAll('.ce-select-option:not(.disabled)'));
      if (!focusable.length) return;
      const currentIdx = focusable.findIndex((el) => el.classList.contains('hover'));
      const selectedIdx = focusable.findIndex((el) => el.classList.contains('selected'));
      const start = currentIdx >= 0 ? currentIdx : selectedIdx;
      let next = start;
      if (event.key === 'ArrowDown') next = Math.min(focusable.length - 1, start + 1);
      else if (event.key === 'ArrowUp') next = Math.max(0, start - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = focusable.length - 1;
      else if (event.key === 'Enter') {
        event.preventDefault();
        const target = focusable[start] instanceof HTMLElement ? focusable[start] : null;
        if (target) {
          setValue(target.dataset.value || '');
          close();
          trigger.focus();
        }
        return;
      } else return;
      event.preventDefault();
      focusable.forEach((el) => el.classList.remove('hover'));
      const nextEl = focusable[next];
      if (nextEl instanceof HTMLElement) {
        nextEl.classList.add('hover');
        nextEl.scrollIntoView({ block: 'nearest' });
      }
    }

    trigger.addEventListener('click', () => {
      list.hidden ? open() : close();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    select.addEventListener('change', syncFromSelect);
    syncFromSelect();
  }

  /** @param {ParentNode} [root] */
  function enhanceAll(root) {
    const scope = root || document;
    scope.querySelectorAll('select.add-input:not(.ce-select-native)').forEach((el) => {
      if (el instanceof HTMLSelectElement) enhance(el);
    });
  }

  // Auto-enhance once DOM is ready, and re-scan whenever modals.js injects markup.
  function autoInit() {
    enhanceAll();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches?.('select.add-input') && node instanceof HTMLSelectElement)
              enhance(node);
            enhanceAll(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit, { once: true });
  } else {
    autoInit();
  }

  window.CESelect = { enhance, enhanceAll };
})();