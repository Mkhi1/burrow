'use strict';

// Small DOM helpers: element builder, context menus, modals, toasts.
(() => {
  const layer = () => document.getElementById('layer');

  /** h('div.cls#id', {attrs/on*}, ...children) */
  function h(tag, props = {}, ...children) {
    const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9]*)(.*)$/i);
    const el = document.createElement(name || 'div');
    for (const part of rest.match(/[.#][^.#]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className += ' ' + v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  let openMenu = null;
  function closeMenu() {
    const el = openMenu;
    openMenu = null;
    if (!el) return;
    if (B.reduceMotion) return el.remove();
    el.style.pointerEvents = 'none';
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.98)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished.then(() => el.remove());
  }

  /**
   * items: [{label, icon, hint, danger, disabled, onClick, submenu?}] | 'sep' | {heading}
   * at: {x, y} or an element to anchor under.
   */
  function menu(items, at) {
    closeMenu();
    const el = h('div.menu', { role: 'menu' });
    for (const it of items) {
      if (it === 'sep') el.append(h('div.sep'));
      else if (it.heading) el.append(h('div.heading', {}, it.heading));
      else {
        const btn = h('button.item', { class: it.danger ? 'danger' : '', disabled: it.disabled },
          it.icon ? h('span', { html: it.icon }) : null,
          h('span.label', {}, it.label),
          it.hint ? h('span.hint', {}, it.hint) : null);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          it.onClick?.();
        });
        el.append(btn);
      }
    }
    layer().append(el);
    let x, y;
    if (at instanceof Element) {
      const r = at.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 4;
    } else ({ x, y } = at);
    const { width, height } = el.getBoundingClientRect();
    if (x + width > innerWidth - 8) x = innerWidth - width - 8;
    if (y + height > innerHeight - 8) y = Math.max(8, y - height - (at instanceof Element ? at.offsetHeight + 8 : 0));
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${y}px`;
    openMenu = el;
    return el;
  }

  addEventListener('mousedown', (e) => openMenu && !openMenu.contains(e.target) && closeMenu(), true);
  addEventListener('blur', closeMenu);

  let openModalEl = null;
  /** Show a modal. Returns {el, close}. onClose fires once. */
  function modal(content, { onClose, className = '' } = {}) {
    closeModal();
    const box = h('div.modal', { class: className }, content);
    const back = h('div.backdrop', { onMousedown: (e) => e.target === back && close() }, box);
    const close = () => {
      if (!back.isConnected || back._closing) return;
      back._closing = true;
      openModalEl = null;
      back.style.pointerEvents = 'none';
      if (B.reduceMotion) back.remove();
      else {
        box.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97) translateY(-4px)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
        back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => back.remove());
      }
      onClose?.();
      B.focusTerminal?.();
    };
    back._close = close;
    layer().append(back);
    openModalEl = back;
    setTimeout(() => box.querySelector('[autofocus], input, textarea, select, button')?.focus(), 20);
    return { el: box, close };
  }
  function closeModal() {
    openModalEl?._close();
  }
  const hasOverlay = () => Boolean(openModalEl || openMenu);

  function toast(html, ms = 2600) {
    const el = h('div.toast', { html });
    document.getElementById('toasts').append(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  Object.assign(B, { h, menu, closeMenu, modal, closeModal, hasOverlay, toast, esc });
})();
