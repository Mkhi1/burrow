'use strict';

// Terminal cards on the right. Pane elements are kept per session and reused.
(() => {
  const { h, icons } = B;
  const paneEls = new Map();
  let lastPage = null;

  // ---------- working timer ----------
  // Agents pause briefly between bursts of output, so a run only ends after a quiet grace period.
  const GRACE_MS = 600; // main already smooths status; just bridge a redraw
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

  const elapsed = (id) => {
    const run = runs.get(id);
    return run ? (run.quietSince || Date.now()) - run.since : null;
  };
  let lastWorking = '';

  function tickTimers() {
    if (!B.state) return;
    const now = Date.now();
    for (const [id, run] of runs) if (run.quietSince && now - run.quietSince > GRACE_MS) runs.delete(id);
    // Sidebar: redraw when the set of working sessions changes, otherwise just update the clocks.
    const working = [...runs.keys()].sort().join(',');
    if (working !== lastWorking) {
      lastWorking = working;
      B.sidebar.render();
    } else {
      for (const el of document.querySelectorAll('.session.is-working')) {
        const t = elapsed(el.dataset.id);
        const span = el.querySelector('.elapsed');
        if (span && t != null) span.textContent = formatElapsed(t);
      }
    }
    for (const [id, pane] of paneEls) {
      const run = runs.get(id);
      pane.timer.classList.toggle('show', Boolean(run));
      // Card-level signal: spinner in the title and a light running along the top edge.
      if (pane.el.classList.contains('working') !== Boolean(run)) {
        pane.el.classList.toggle('working', Boolean(run));
        const session = B.sessionById(id);
        const agentId = session ? B.agentOf(session) : 'shell';
        pane.brand.innerHTML = run ? B.workingMark(agentId) : icons.brand;
        pane.el.style.setProperty('--c', B.agentColor(agentId));
      }
      if (run) pane.timerText.textContent = `Working… ${formatElapsed((run.quietSince || now) - run.since)}`;
    }
  }
  setInterval(tickTimers, 1000);

  function currentPage() {
    const { pages, settings } = B.state;
    return pages[settings.page] || pages[0];
  }

  function buildPane(id) {
    if (B.editor.isEditorId(id)) {
      const pane = B.editor.buildPane(id);
      pane.el.addEventListener('mousedown', () => focusPane(id));
      paneEls.set(id, pane);
      return pane;
    }
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
    }, head, h('div', { style: { position: 'relative', flex: '1', minHeight: '0', display: 'flex' } }, body, overlay));
    body.style.flex = '1';
    const pane = { el, title, brand, body, overlay, timer, timerText };
    paneEls.set(id, pane);
    return pane;
  }

  function updatePane(pane, id, focused) {
    if (B.editor.isEditorId(id)) {
      pane.el.classList.toggle('focused', focused);
      return;
    }
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
    const ids = page.panes.filter((id) => B.sessionById(id) || B.editor.isOpenable(id));

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
      if (!B.editor.isEditorId(id)) B.terminals.attach(id, pane.body);
    });
    empty.classList.toggle('show', ids.length === 0);
    if (!ids.length) renderEmpty(empty);
    slidePage(container, empty);
    tickTimers();
    requestAnimationFrame(B.terminals.refitAll);
  }

  // ---------- drag a session from the sidebar onto the stage ----------
  // A layer covers the stage while dragging (terminals and title bars would swallow the drop)
  // and a soft box previews where the session will land.
  const MAX_PANES = 4;
  const stageEl = document.getElementById('stage');
  const dropHint = h('div.drop-hint', {}, h('span'));
  const dropLayer = h('div.drop-layer', {}, dropHint);
  stageEl.append(dropLayer);
  let dragId = null;
  let dropAt = null;

  B.beginSessionDrag = (id) => {
    dragId = id;
    dropAt = null;
    dropLayer.classList.add('on');
    dropHint.classList.remove('show');
  };
  function endDrag() {
    dragId = null;
    dropAt = null;
    dropLayer.classList.remove('on');
    dropHint.classList.remove('show');
  }
  document.addEventListener('dragend', endDrag);

  /** Which pane and side the pointer is over, plus the box to preview. */
  function zoneAt(x, y) {
    const page = currentPage();
    const ids = page.panes.filter((id) => paneEls.get(id)?.el.isConnected);
    if (!ids.length) return { target: null, side: 'center', rect: document.getElementById('panes').getBoundingClientRect(), label: 'Open here' };
    for (const id of ids) {
      const r = paneEls.get(id).el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (id === dragId) return null;
      const others = ids.filter((x2) => x2 !== dragId).length;
      const fx = (x - r.left) / r.width;
      const fy = (y - r.top) / r.height;
      let side;
      if (others >= MAX_PANES) side = 'center';
      else if (others > 1) side = page.dir === 'col' ? (fy < 0.5 ? 'top' : 'bottom') : (fx < 0.5 ? 'left' : 'right');
      else side = fy < 0.22 ? 'top' : fy > 0.78 ? 'bottom' : fx < 0.5 ? 'left' : 'right';
      const half = {
        left: { left: r.left, top: r.top, width: r.width / 2, height: r.height },
        right: { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height },
        top: { left: r.left, top: r.top, width: r.width, height: r.height / 2 },
        bottom: { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 },
        center: { left: r.left, top: r.top, width: r.width, height: r.height },
      }[side];
      return { target: id, side, rect: half, label: side === 'center' ? 'Replace' : 'Split here' };
    }
    return null;
  }

  dropLayer.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const z = zoneAt(e.clientX, e.clientY);
    dropAt = z;
    dropHint.classList.toggle('show', Boolean(z));
    if (!z) return;
    const s = stageEl.getBoundingClientRect();
    const gap = 4;
    Object.assign(dropHint.style, {
      left: `${z.rect.left - s.left + gap}px`,
      top: `${z.rect.top - s.top + gap}px`,
      width: `${z.rect.width - gap * 2}px`,
      height: `${z.rect.height - gap * 2}px`,
    });
    dropHint.firstChild.textContent = z.label;
  });
  dropLayer.addEventListener('dragleave', (e) => {
    if (e.target === dropLayer && !dropLayer.contains(e.relatedTarget)) dropHint.classList.remove('show');
  });
  dropLayer.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = dragId;
    const z = dropAt;
    endDrag();
    if (id && z) burrow.dispatch({ type: 'pane/place', sessionId: id, target: z.target, side: z.side });
  });

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
    if (from == null || from === index || B.reduceMotion) return;
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
        h('button.btn', { onClick: () => B.addProject() }, 'Add project ', h('kbd', {}, 'Ctrl Shift O'))),
      h('div.credit', {}, 'Developed by MK')));
  }

  function focusPane(id) {
    const page = currentPage();
    if (page.focus !== id) burrow.dispatch({ type: 'pane/focus', sessionId: id });
    B.clearUnread(id);
  }

  function forget(id) {
    paneEls.get(id)?.el.remove();
    paneEls.delete(id);
    if (B.editor.isEditorId(id)) B.editor.dispose(id);
    else B.terminals.dispose(id);
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
  B.panes = { render, forget, currentPage, trackStatus, elapsed, formatElapsed };
})();
