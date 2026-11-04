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
    // The icon and title are a grip: drag them to move this pane anywhere in the layout.
    const grip = { draggable: 'true', onDragstart: (e) => startPaneDrag(e, id), title: 'Drag to move this pane' };
    const title = h('span.title.grip', grip);
    const brand = h('span.brand.grip', { ...grip, html: icons.brand });
    const body = h('div.pane-body');
    const overlay = h('div.pane-overlay', { style: { display: 'none' } });
    const tools = h('div.tools', {},
      h('button.icon-btn', { html: icons.splitRight, title: 'Split right (Ctrl+Shift+D)', onClick: (e) => B.splitWithNew('row', e.currentTarget) }),
      h('button.icon-btn', { html: icons.splitDown, title: 'Split down (Ctrl+Shift+E)', onClick: (e) => B.splitWithNew('col', e.currentTarget) }),
      h('button.icon-btn', { html: icons.zoom, title: 'Zoom pane (Ctrl+Shift+Enter)', onClick: () => toggleZoom(id) }),
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

  // ---------- layout: a tree of splits ----------
  // The page stores a tree: a pane id, or { dir: 'row' | 'col', kids, sizes }.
  // When only sizes change we just update flex values; when the shape changes we rebuild
  // and let every pane glide from where it was to where it lands.
  let lastShape = '';
  let lastPageId = null;
  let flexTargets = []; // [{ el }] in tree order, matched to sizes on size-only updates
  let zoomed = null;

  const shapeOf = (node) => (typeof node === 'string' ? node : `${node.dir}(${node.kids.map(shapeOf).join(',')})`);

  /** The stored tree minus panes that can't be shown; each split remembers its path in the stored tree. */
  function visibleTree(node, ok, path = []) {
    if (!node) return null;
    if (typeof node === 'string') return ok(node) ? node : null;
    const kids = [];
    const sizes = [];
    node.kids.forEach((k, i) => {
      const t = visibleTree(k, ok, [...path, i]);
      if (!t) return;
      kids.push(t);
      sizes.push(node.sizes?.[i] > 0 ? node.sizes[i] : 1);
    });
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    return { dir: node.dir, kids, sizes, path };
  }

  function build(node, out) {
    if (typeof node === 'string') return (paneEls.get(node) || buildPane(node)).el;
    const el = h(`div.split.${node.dir}`);
    node.kids.forEach((kid, i) => {
      if (i > 0) el.append(buildGutter(node));
      const child = build(kid, out);
      out.push(child);
      el.append(child);
    });
    return el;
  }

  function applySizes(node, list, i = { n: 0 }) {
    if (typeof node === 'string') return;
    node.kids.forEach((kid, k) => {
      const el = list[i.n++];
      if (el) el.style.flex = `${node.sizes[k]} 1 0`;
      applySizes(kid, list, i);
    });
  }

  function render() {
    const page = currentPage();
    const container = document.getElementById('panes');
    const empty = document.getElementById('empty');
    const tree = visibleTree(page.tree, (id) => Boolean(B.sessionById(id) || B.editor.isOpenable(id)));
    const ids = tree ? (typeof tree === 'string' ? [tree] : leavesOf(tree)) : [];
    const shape = tree ? shapeOf(tree) : '';
    const samePage = lastPageId === page.id;
    lastPageId = page.id;

    container.classList.toggle('multi', ids.length > 1);
    if (zoomed && !ids.includes(zoomed)) setZoom(null, false);
    if (shape !== lastShape || !container.firstChild !== !tree) {
      lastShape = shape;
      const before = new Map();
      if (samePage) for (const [id, p] of paneEls) if (p.el.isConnected) before.set(id, p.el.getBoundingClientRect());
      // Detach panes that are no longer visible (terminals stay alive in memory).
      for (const [id, pane] of paneEls) if (!ids.includes(id)) pane.el.remove();
      const out = [];
      if (tree) {
        const root = build(tree, out);
        root.style.flex = '1 1 0';
        container.replaceChildren(root);
      } else container.replaceChildren();
      flexTargets = out;
      if (tree) applySizes(tree, flexTargets);
      glide(ids, before);
    } else if (tree) {
      applySizes(tree, flexTargets);
    }
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

  const leavesOf = (node) => (typeof node === 'string' ? [node] : node.kids.flatMap(leavesOf));

  const EASE = 'cubic-bezier(.2,.8,.2,1)';

  /** FLIP: each pane that moved slides and resizes from its old box; new panes fade in. */
  function glide(ids, before) {
    if (B.reduceMotion) return;
    for (const id of ids) {
      const el = paneEls.get(id).el;
      const a = before.get(id);
      if (!a) {
        el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
        continue;
      }
      const b = el.getBoundingClientRect();
      if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 2) continue;
      el.animate([
        { transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: 300, easing: EASE });
    }
    setTimeout(() => B.terminals.refitAll(), 320);
  }

  // ---------- zoom: one pane fills the stage for a moment ----------
  function setZoom(id, animate = true) {
    const container = document.getElementById('panes');
    const prev = zoomed && paneEls.get(zoomed)?.el;
    const next = id && paneEls.get(id)?.el;
    const el = next || prev;
    const a = el?.getBoundingClientRect();
    prev?.classList.remove('zoom');
    zoomed = next ? id : null;
    next?.classList.add('zoom');
    container.classList.toggle('zoomed', Boolean(zoomed));
    if (el && a && animate && !B.reduceMotion) {
      const b = el.getBoundingClientRect();
      el.animate([
        { transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: 280, easing: EASE });
    }
    setTimeout(() => B.terminals.refitAll(), animate ? 300 : 0);
  }
  function toggleZoom(id = currentPage().focus) {
    if (!id) return;
    setZoom(zoomed === id ? null : id);
  }

  // ---------- drag a session from the sidebar onto the stage ----------
  // A layer covers the stage while dragging (terminals and title bars would swallow the drop)
  // and a soft box previews where the session will land.
  const MAX_PANES = 6;
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

  function startPaneDrag(e, id) {
    e.dataTransfer.setData('text/burrow-session', id);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = paneEls.get(id)?.el.querySelector('.pane-head');
    if (ghost) e.dataTransfer.setDragImage(ghost, 20, 18);
    if (zoomed) setZoom(null, false);
    B.beginSessionDrag(id);
  }

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
      // Nearest edge picks the side; the middle of the pane swaps it out instead.
      const edges = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
      const middle = Math.abs(fx - 0.5) < 0.16 && Math.abs(fy - 0.5) < 0.16;
      const side = others >= MAX_PANES || middle ? 'center' : Object.keys(edges).reduce((m, k) => (edges[k] < edges[m] ? k : m));
      const half = {
        left: { left: r.left, top: r.top, width: r.width / 2, height: r.height },
        right: { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height },
        top: { left: r.left, top: r.top, width: r.width, height: r.height / 2 },
        bottom: { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 },
        center: { left: r.left, top: r.top, width: r.width, height: r.height },
      }[side];
      const moving = page.panes.includes(dragId);
      return { target: id, side, rect: half, label: side === 'center' ? (moving ? 'Swap here' : 'Replace') : moving ? 'Move here' : 'Split here' };
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
    if (!id || !z) return;
    const page = currentPage();
    if (z.side === 'center' && page.panes.includes(id)) {
      // dragging a pane onto another one swaps them
      burrow.dispatch({ type: 'pane/swap', a: id, b: z.target });
    } else burrow.dispatch({ type: 'pane/place', sessionId: id, target: z.target, side: z.side });
  });

  // ---------- resizable splits ----------
  const MIN_SHARE = 0.1;

  /** Drag handle between two children of a split; double-click makes that split even. */
  function buildGutter(node) {
    const g = h('div.gutter', { title: 'Drag to resize · double-click to even out' }, h('i'));
    g.addEventListener('dblclick', () => burrow.dispatch({ type: 'pane/sizes', path: node.path, sizes: node.kids.map(() => 1) }));
    g.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const split = g.parentElement;
      const col = split.classList.contains('col');
      const kids = [...split.children].filter((c) => !c.classList.contains('gutter'));
      const index = [...split.children].indexOf(g) / 2 - 0.5; // child before the gutter
      const before = kids[index];
      const after = kids[index + 1];
      const size = (el) => (col ? el.getBoundingClientRect().height : el.getBoundingClientRect().width);
      const all = kids.map(size);
      const sum = all.reduce((a, b) => a + b, 0);
      const pair = all[index] + all[index + 1];
      const start = col ? e.clientY : e.clientX;
      document.body.classList.add(col ? 'resizing-row' : 'resizing-col');
      g.classList.add('active');
      kids.forEach((k, i) => (k.style.flex = `${all[i] / sum} 1 0`));
      const move = (ev) => {
        const delta = (col ? ev.clientY : ev.clientX) - start;
        const min = sum * MIN_SHARE;
        const a = Math.min(Math.max(all[index] + delta, min), pair - min);
        before.style.flex = `${a / sum} 1 0`;
        after.style.flex = `${(pair - a) / sum} 1 0`;
      };
      const up = () => {
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', up);
        document.body.classList.remove('resizing-row', 'resizing-col');
        g.classList.remove('active');
        const sizes = kids.map((k) => Math.round((size(k) / sum) * 1000) / 1000);
        burrow.dispatch({ type: 'pane/sizes', path: node.path, sizes });
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
  B.toggleZoom = toggleZoom;
  B.panes = { render, forget, currentPage, trackStatus, elapsed, formatElapsed };
})();
