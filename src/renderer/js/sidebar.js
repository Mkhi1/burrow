'use strict';

// Project / session tree in the sidebar.
(() => {
  const { h, icons } = B;

  /** Sessions in display order: pinned first, then oldest first (stable like a list of tasks). */
  function orderedSessions(projectId) {
    return B.state.sessions
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => (b.pinned - a.pinned) || (a.createdAt - b.createdAt));
  }

  /** Flat list of sessions as they appear in the sidebar (for Ctrl+1..9 and Ctrl+Tab). */
  const visibleOrder = () =>
    B.state.projects.flatMap((p) => (p.collapsed ? [] : orderedSessions(p.id)));

  function glyphFor(session) {
    const status = B.statuses[session.id] || 'dormant';
    const unread = B.unread[session.id];
    if (status === 'attention' || unread === 'attention') return '<span class="status-dot attention"></span>';
    if (unread === 'done' && status !== 'busy') return '<span class="status-dot unread"></span>';
    return B.dots(status === 'busy');
  }

  function sessionRow(session, page) {
    const status = B.statuses[session.id] || 'dormant';
    const agent = B.agentById(session.agent);
    const dormant = status === 'dormant' || status === 'exited';
    const row = h('div.session', {
      class: [
        dormant ? 'dormant' : '',
        page.focus === session.id ? 'selected' : '',
        page.panes.includes(session.id) ? 'visible' : '',
      ].join(' '),
      title: `${session.title}\n${agent.name} · ${status}`,
      'data-id': session.id,
      'data-key': `s:${session.id}`,
      draggable: 'true',
      onClick: () => B.showSession(session.id),
      onDblclick: (e) => {
        e.stopPropagation();
        startRename(row, session);
      },
      onContextmenu: (e) => {
        e.preventDefault();
        B.sessionMenu(session.id, { x: e.clientX, y: e.clientY });
      },
      onDragstart: (e) => e.dataTransfer.setData('text/burrow-session', session.id),
    },
    h('span.glyph', { html: glyphFor(session), style: { color: 'var(--text-2)' } }),
    h('span.title', {}, session.title),
    session.pinned ? h('span.pin', { html: icons.pin }) : null,
    h('span.agent', { html: B.agentIcon(session.agent), title: agent.name }));
    return row;
  }

  function startRename(row, session) {
    const titleEl = row.querySelector('.title');
    const input = h('input.rename', { value: session.title, spellcheck: 'false' });
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      input.remove();
      const title = input.value.trim();
      if (save && title && title !== session.title) burrow.dispatch({ type: 'session/rename', id: session.id, title });
      else render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function projectRow(project) {
    return h('div.project', {
      'data-key': `p:${project.id}`,
      class: project.collapsed ? 'collapsed' : '',
      title: project.path,
      onClick: () => burrow.dispatch({ type: 'project/toggle', id: project.id }),
      onContextmenu: (e) => {
        e.preventDefault();
        B.projectMenu(project.id, { x: e.clientX, y: e.clientY });
      },
    },
    h('span.folder', { html: icons.folder }),
    h('span.name', {}, project.name),
    h('button.icon-btn.add', {
      html: icons.plus,
      title: 'New session in this project',
      onClick: (e) => {
        e.stopPropagation();
        B.quickNew(project.id, e.currentTarget);
      },
    }));
  }

  let firstRender = true;

  // Remember where each row sits so the next render can animate from there (FLIP).
  function snapshot(tree) {
    const pos = new Map();
    for (const el of tree.querySelectorAll('[data-key]')) pos.set(el.dataset.key, el.getBoundingClientRect().top);
    return pos;
  }

  function animateRows(tree, before) {
    if (B.reduceMotion) return;
    for (const el of tree.querySelectorAll('[data-key]')) {
      const old = before.get(el.dataset.key);
      if (old == null) {
        el.animate(
          [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
        continue;
      }
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
  }

  function render() {
    const tree = document.getElementById('tree');
    const before = snapshot(tree);
    if (tree.querySelector('.rename')) return renderPageDots(); // don't clobber an inline rename
    const { projects, pages, settings } = B.state;
    const page = pages[settings.page] || pages[0];
    const scroll = tree.scrollTop;
    tree.replaceChildren();
    if (!projects.length) {
      tree.append(h('div.empty-hint', {},
        'No projects yet. ',
        h('button', { onClick: () => B.addProject() }, 'Add a folder'),
        ' to start running agents in it.'));
    }
    for (const project of projects) {
      tree.append(projectRow(project));
      if (!project.collapsed) orderedSessions(project.id).forEach((s) => tree.append(sessionRow(s, page)));
    }
    tree.scrollTop = scroll;
    if (!firstRender) animateRows(tree, before);
    firstRender = false;
    renderPageDots();
  }

  function renderPageDots() {
    const box = document.getElementById('page-dots');
    const { pages, settings } = B.state;
    box.replaceChildren(
      ...pages.map((p, i) =>
        h('button', {
          class: i === settings.page ? 'on' : '',
          title: `Page ${i + 1} (Ctrl+Alt+←/→)`,
          onClick: () => burrow.dispatch({ type: 'page/go', index: i }),
          onContextmenu: (e) => {
            e.preventDefault();
            B.menu([
              { label: 'New page', icon: icons.page, onClick: () => burrow.dispatch({ type: 'page/add' }) },
              { label: 'Close page', icon: icons.close, danger: true, disabled: pages.length < 2,
                onClick: () => burrow.dispatch({ type: 'page/remove', index: i }) },
            ], { x: e.clientX, y: e.clientY });
          },
        })
      )
    );
  }

  B.sidebar = { render, visibleOrder, startRename: (id) => {
    const row = document.querySelector(`.session[data-id="${id}"]`);
    const session = B.sessionById(id);
    if (row && session) startRename(row, session);
  } };
})();
