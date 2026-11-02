'use strict';

// Terminal cards on the right. Pane elements are kept per session and reused.
(() => {
  const { h, icons } = B;
  const paneEls = new Map();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastPage = null;

  // ---------- working timer ----------
  // Agents pause briefly between bursts of output, so a run only ends after a quiet grace period.
  const GRACE_MS = 5000;
  const runs = new Map(); // id -> { since, quietSince }

  function trackStatus(id, status) {
    const run = runs.get(id);
    if (status === 'busy') {
      if (!run) runs.set(id, { since: Date.now(), quietSince: null });
      else run.quietSince = null;
    } else if (run && run.quietSince == null) {
      run.quietSince = Date.now();
    }
    if (status === 'exited' || status === 'dormant') runs.delete(id);
  }

  const formatElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  };

  function tickTimers() {
    const now = Date.now();
    for (const [id, run] of runs) if (run.quietSince && now - run.quietSince > GRACE_MS) runs.delete(id);
    for (const [id, pane] of paneEls) {
      const run = runs.get(id);
      pane.timer.classList.toggle('show', Boolean(run));
      if (run) pane.timerText.textContent = `Working… ${formatElapsed((run.quietSince || now) - run.since)}`;
    }
  }
  setInterval(tickTimers, 1000);

  function currentPage() {
    const { pages, settings } = B.state;
    return pages[settings.page] || pages[0];
  }

  function buildPane(id) {
    const title = h('span.title');
    const brand = h('span.brand', { html: icons.brand });
    const body = h('div.pane-body');
    const overlay = h('div.pane-overlay', { style: { display: 'none' } });
    const tools = h('div.tools', {},
      h('button.icon-btn', { html: icons.splitRight, title: 'Split right (Ctrl+Shift+D)', onClick: (e) => B.splitWithNew('row', e.currentTarget) }),
      h('button.icon-btn', { html: icons.splitDown, title: 'Split down (Ctrl+Shift+E)', onClick: (e) => B.splitWithNew('col', e.currentTarget) }),
      h('button.icon-btn', { html: icons.more, title: 'More', onClick: (e) => B.sessionMenu(id, e.currentTarget, true) }));
    const timerText = h('span');
    const timer = h('span.timer', {}, h('span.timer-dot'), timerText);
    const head = h('div.pane-head', { onDblclick: () => burrow.maximize() }, brand, title, timer, tools);
    const el = h('section.pane', {
      'data-id': id,
      onMousedown: () => focusPane(id),
      onDragover: (e) => {
        if (e.dataTransfer.types.includes('text/burrow-session')) e.preventDefault();
      },
      onDrop: (e) => {
        const dropped = e.dataTransfer.getData('text/burrow-session');
        if (!dropped || dropped === id) return;
        const r = el.getBoundingClientRect();
        const dir = (e.clientY - r.top) / r.height > 0.66 ? 'col' : 'row';
        burrow.dispatch({ type: 'pane/focus', sessionId: id }).then(() => burrow.dispatch({ type: 'pane/split', sessionId: dropped, dir }));
      },
    }, head, h('div', { style: { position: 'relative', flex: '1', minHeight: '0', display: 'flex' } }, body, overlay));
    body.style.flex = '1';
    const pane = { el, title, brand, body, overlay, timer, timerText };
    paneEls.set(id, pane);
    return pane;
  }

  function updatePane(pane, id, focused) {
    const session = B.sessionById(id);
    if (!session) return;
    const agent = B.agentById(session.agent);
    pane.title.textContent = session.title;
    pane.el.classList.toggle('focused', focused);
    const status = B.statuses[id] || 'dormant';
    if (status === 'exited') {
      pane.overlay.style.display = 'grid';
      pane.overlay.replaceChildren(h('div', {},
        h('div', {}, `${agent.name} exited.`),
        h('button.btn', { onClick: () => B.terminals.restart(id) }, 'Restart session')));
    } else pane.overlay.style.display = 'none';
  }

  function render() {
    const page = currentPage();
    const container = document.getElementById('panes');
    const empty = document.getElementById('empty');
    const ids = page.panes.filter((id) => B.sessionById(id));

    container.className = `panes ${page.dir === 'col' ? 'col' : ''} ${ids.length > 1 ? 'multi' : ''}`;
    // Detach panes that are no longer visible (terminals stay alive in memory).
    for (const [id, pane] of paneEls) if (!ids.includes(id)) pane.el.remove();
    const sizes = page.sizes?.length === ids.length ? page.sizes : ids.map(() => 1);
    const wanted = [];
    ids.forEach((id, i) => {
      const pane = paneEls.get(id) || buildPane(id);
      pane.el.style.flex = `${sizes[i]} 1 0`;
      if (i > 0) wanted.push(gutters[i - 1] || (gutters[i - 1] = buildGutter()));
      wanted.push(pane.el);
    });
    const current = [...container.children];
    if (current.length !== wanted.length || current.some((el, i) => el !== wanted[i])) container.replaceChildren(...wanted);
    ids.forEach((id) => {
      const pane = paneEls.get(id);
      updatePane(pane, id, id === page.focus);
      B.terminals.attach(id, pane.body);
    });
    empty.classList.toggle('show', ids.length === 0);
    if (!ids.length) renderEmpty(empty);
    slidePage(container, empty);
    tickTimers();
    requestAnimationFrame(B.terminals.refitAll);
  }

  // ---------- resizable splits ----------
  const gutters = [];
  const MIN_SHARE = 0.12;

  /** Drag handle between two panes; drag to resize, double-click to make all panes equal. */
  function buildGutter() {
    const g = h('div.gutter', { title: 'Drag to resize · double-click to reset' }, h('i'));
    g.addEventListener('dblclick', () => burrow.dispatch({ type: 'pane/sizes', sizes: currentPage().panes.map(() => 1) }));
    g.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const container = g.parentElement;
      const col = container.classList.contains('col');
      const panes = [...container.querySelectorAll(':scope > .pane')];
      const index = [...container.children].indexOf(g) / 2 - 0.5; // pane before the gutter
      const before = panes[index];
      const after = panes[index + 1];
      const size = (el) => (col ? el.getBoundingClientRect().height : el.getBoundingClientRect().width);
      const all = panes.map(size);
      const sum = all.reduce((a, b) => a + b, 0);
      const pair = all[index] + all[index + 1];
      const start = col ? e.clientY : e.clientX;
      document.body.classList.add(col ? 'resizing-row' : 'resizing-col');
      g.classList.add('active');
      const shares = () => panes.map((p) => size(p) / sum);
      const move = (ev) => {
        const delta = (col ? ev.clientY : ev.clientX) - start;
        const min = sum * MIN_SHARE;
        const a = Math.min(Math.max(all[index] + delta, min), pair - min);
        before.style.flex = `${a / sum} 1 0`;
        after.style.flex = `${(pair - a) / sum} 1 0`;
        panes.forEach((p, i) => i !== index && i !== index + 1 && (p.style.flex = `${all[i] / sum} 1 0`));
      };
      const up = () => {
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', up);
        document.body.classList.remove('resizing-row', 'resizing-col');
        g.classList.remove('active');
        burrow.dispatch({ type: 'pane/sizes', sizes: shares().map((s) => Math.round(s * 1000) / 1000) });
        B.terminals.refitAll();
      };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
    return g;
  }

  /** Slide the stage sideways when the page changes, in the direction of travel. */
  function slidePage(container, empty) {
    const index = B.state.settings.page;
    const from = lastPage;
    lastPage = index;
    if (from == null || from === index || reduceMotion) return;
    const dx = index > from ? 48 : -48;
    const target = empty.classList.contains('show') ? empty : container;
    target.animate(
      [{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }

  function renderEmpty(empty) {
    const hasProjects = B.state.projects.length > 0;
    empty.replaceChildren(h('div', {},
      h('h1', {}, hasProjects ? 'Nothing open on this page' : 'Welcome to Burrow'),
      h('p', {}, hasProjects ? 'Pick a session on the left, or start a new one.' : 'Add a project folder, then start Claude Code, Codex or any agent in it.'),
      h('div.row', {},
        hasProjects ? h('button.btn.primary', { onClick: () => B.newSessionDialog() }, 'New session ', h('kbd', {}, 'Ctrl Shift N')) : null,
        h('button.btn', { onClick: () => B.addProject() }, 'Add project ', h('kbd', {}, 'Ctrl Shift O')))));
  }

  function focusPane(id) {
    const page = currentPage();
    if (page.focus !== id) burrow.dispatch({ type: 'pane/focus', sessionId: id });
    B.clearUnread(id);
  }

  function forget(id) {
    paneEls.get(id)?.el.remove();
    paneEls.delete(id);
    B.terminals.dispose(id);
  }

  /** Fade a pane out, then remove it from the layout. */
  function closePane(id) {
    const el = paneEls.get(id)?.el;
    const done = () => burrow.dispatch({ type: 'pane/close', sessionId: id });
    if (!el || !el.isConnected || B.reduceMotion) return done();
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
      done().then(() => el.getAnimations().forEach((a) => a.cancel()));
    });
  }

  B.closePane = closePane;
  B.focusPane = focusPane;
  B.panes = { render, forget, currentPage, trackStatus };
})();
