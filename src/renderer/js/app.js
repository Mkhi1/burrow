'use strict';

(async () => {
  const { h, icons } = B;
  const app = document.getElementById('app');

  const pendingOpens = [];
  let appReady = false;
  burrow.onOpenFile((projectId, rel) => (appReady ? B.editor.open(projectId, rel) : pendingOpens.push([projectId, rel])));

  const boot = await burrow.getState();
  B.state = boot.state;
  B.agents = boot.agents;
  B.statuses = boot.statuses;
  B.detected = boot.detected || {};
  // What's really running in a session (a Terminal may be running Claude Code).
  B.agentOf = (session) => B.detected[session.id] || session.agent;
  // "Working" mark: a 3×3 square of dots lit in a loop around its edge, in the agent's color.
  const AGENT_COLORS = { claude: '#ff8a3d' };
  B.agentColor = (agentId) => AGENT_COLORS[agentId] || '#fff';
  B.workingMark = (agentId) =>
    `<span class="dots-loader" style="--c:${B.agentColor(agentId)}">${'<i></i>'.repeat(9)}</span>`;
  const systemReduce = matchMedia('(prefers-reduced-motion: reduce)');
  // Motion is on unless the user chose to follow Windows' "reduce animations".
  const computeReduce = () => B.state.settings.motion === 'system' && systemReduce.matches;
  B.reduceMotion = computeReduce();
  B.unread = {};

  B.sessionById = (id) => B.state.sessions.find((s) => s.id === id);
  B.agentById = (id) => B.agents.find((a) => a.id === id) || B.agents[B.agents.length - 1];

  B.showSession = async (id) => {
    if (B.usage?.isOpen()) B.usage.close();
    await burrow.dispatch({ type: 'session/show', id });
    B.clearUnread(id);
    setTimeout(() => B.terminals.focus(id), 30);
  };
  B.clearUnread = (id) => {
    if (!B.unread[id]) return;
    delete B.unread[id];
    B.sidebar.render();
  };
  B.focusTerminal = () => {
    const page = B.panes.currentPage();
    if (!page.focus) return;
    if (B.editor?.isEditorId(page.focus)) B.editor.focus(page.focus);
    else B.terminals.focus(page.focus);
  };

  // ---------- chrome ----------

  function buildChrome() {
    const lights = (container) => {
      container.replaceChildren(
        h('button.light.close', { title: 'Close', html: B.lightIcons.close, onClick: burrow.close }),
        h('button.light.min', { title: 'Minimize', html: B.lightIcons.min, onClick: burrow.minimize }),
        h('button.light.max', { title: 'Maximize', html: B.lightIcons.max, onClick: burrow.maximize }));
    };
    lights(document.getElementById('lights'));
    const toggle = document.getElementById('toggle-sidebar');
    toggle.innerHTML = icons.sidebar;
    toggle.addEventListener('click', toggleSidebar);
    document.getElementById('brand').innerHTML = icons.brand;

    // Floating controls shown when the sidebar is collapsed.
    const floating = document.getElementById('floating-bar');
    const fl = h('div.lights');
    lights(fl);
    floating.append(fl, h('button.icon-btn', { html: icons.sidebar, title: 'Show sidebar (Ctrl+Shift+B)', onClick: toggleSidebar }));

    const add = document.getElementById('add-btn');
    add.innerHTML = icons.plus;
    add.addEventListener('click', () => B.addMenu(add));
    const usageBtn = document.getElementById('usage-btn');
    usageBtn.innerHTML = icons.chart;
    usageBtn.addEventListener('click', () => B.usage.toggle());
    const gear = document.getElementById('settings-btn');
    gear.innerHTML = icons.gear;
    gear.addEventListener('click', B.settingsDialog);

    addEventListener('blur', () => document.body.classList.add('blurred'));
    addEventListener('focus', () => document.body.classList.remove('blurred'));
    setupResizer();
  }

  function toggleSidebar() {
    burrow.dispatch({ type: 'settings/update', patch: { sidebarVisible: !B.state.settings.sidebarVisible } });
  }

  function setupResizer() {
    const resizer = document.getElementById('resizer');
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      app.classList.add('resizing');
      const move = (ev) => {
        const w = Math.min(460, Math.max(200, ev.clientX));
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
      };
      const up = (ev) => {
        app.classList.remove('resizing');
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', up);
        burrow.dispatch({ type: 'settings/update', patch: { sidebarWidth: Math.min(460, Math.max(200, ev.clientX)) } });
        B.terminals.refitAll();
      };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
    resizer.addEventListener('dblclick', () => burrow.dispatch({ type: 'settings/update', patch: { sidebarWidth: 272 } }));
  }

  function applySettings() {
    const st = B.state.settings;
    const root = document.documentElement.style;
    root.setProperty('--accent', st.accent);
    root.setProperty('--tint', st.material === 'none' ? 1 : st.tint);
    root.setProperty('--sidebar-w', `${st.sidebarWidth}px`);
    document.body.classList.toggle('no-material', st.material === 'none');
    const wasHidden = app.classList.contains('sidebar-hidden');
    app.classList.toggle('sidebar-hidden', !st.sidebarVisible);
    if (wasHidden === st.sidebarVisible) setTimeout(B.terminals.refitAll, 240);
    B.reduceMotion = computeReduce();
    document.body.classList.toggle('reduce-motion', B.reduceMotion);
    B.scenes.setReduce(B.reduceMotion);
    B.scenes.set(st.scene || 'none');
    document.getElementById('scene').style.opacity = String(st.sceneStrength ?? 1);
    document.body.classList.toggle('glass-cards', Boolean(st.scene && st.scene !== 'none' && st.glassCards));
    B.terminals.applySettings();
  }

  function renderAll() {
    applySettings();
    B.sidebar.render();
    B.panes.render();
    const focused = B.sessionById(B.panes.currentPage().focus);
    document.title = focused ? `${focused.title} — Burrow` : 'Burrow';
  }

  // ---------- keyboard ----------

  function cycle(step) {
    const order = B.sidebar.visibleOrder();
    if (!order.length) return;
    const i = order.findIndex((s) => s.id === B.panes.currentPage().focus);
    B.showSession(order[(i + step + order.length) % order.length].id);
  }

  const shortcuts = [
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'n', run: () => B.newSessionDialog() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'o', run: () => B.addProject() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && (k === 'p' || k === 'k'), run: () => B.palette() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'b', run: toggleSidebar },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'u', run: () => B.usage.toggle() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'f', run: () => B.editor.quickOpen() },
    { match: (e, k) => e.ctrlKey && k === ',', run: () => B.settingsDialog() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'd', run: () => B.splitWithNew('row') },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'e', run: () => B.splitWithNew('col') },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'enter', run: () => B.toggleZoom() },
    { match: (e, k) => e.ctrlKey && e.shiftKey && k === 'w', run: () => {
      const id = B.panes.currentPage().focus;
      if (id) B.closePane(id);
    } },
    { match: (e, k) => e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(k), run: (e) => {
      const s = B.sidebar.visibleOrder()[Number(e.key) - 1];
      if (s) B.showSession(s.id);
    } },
    { match: (e) => e.ctrlKey && e.key === 'Tab', run: (e) => cycle(e.shiftKey ? -1 : 1) },
    { match: (e) => e.ctrlKey && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'), run: (e) =>
      burrow.dispatch({ type: 'page/go', index: B.state.settings.page + (e.key === 'ArrowLeft' ? -1 : 1) }) },
    { match: (e) => e.ctrlKey && (e.key === '=' || e.key === '+'), run: () => fontSize(1) },
    { match: (e) => e.ctrlKey && e.key === '-', run: () => fontSize(-1) },
    { match: (e) => e.ctrlKey && e.key === '0', run: () => burrow.dispatch({ type: 'settings/update', patch: { fontSize: 13 } }) },
    { match: (e) => e.key === 'F11', run: () => burrow.fullscreen() },
    { match: (e) => e.key === 'F2', run: () => {
      const id = B.panes.currentPage().focus;
      if (id) B.sidebar.startRename(id);
    } },
  ];

  const fontSize = (d) =>
    burrow.dispatch({ type: 'settings/update', patch: { fontSize: Math.min(24, Math.max(9, B.state.settings.fontSize + d)) } });

  const findShortcut = (e) => shortcuts.find((s) => s.match(e, e.key.toLowerCase()));
  B.isAppShortcut = (e) => Boolean(findShortcut(e));

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && B.hasOverlay()) {
      B.closeMenu();
      B.closeModal();
      return;
    }
    if (e.key === 'Escape' && B.usage.isOpen()) {
      B.usage.close();
      return;
    }
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement.closest('.xterm');
    const sc = findShortcut(e);
    if (!sc || (inField && !e.ctrlKey)) return;
    e.preventDefault();
    e.stopPropagation();
    sc.run(e);
  }, true);

  // ---------- live updates ----------

  burrow.onDemo((view) => view === 'usage' && B.usage.open());
  burrow.onDetected((map) => {
    B.detected = map;
    B.sidebar.render();
  });
  // ---------- auto-update ----------
  B.update = await burrow.updateStatus();
  function renderUpdate() {
    const u = B.update || {};
    const pill = document.getElementById('update-pill');
    pill.className = `update-pill ${u.state === 'downloading' || u.state === 'ready' ? 'show' : ''}`;
    if (u.state === 'downloading') {
      pill.replaceChildren(h('span.spinner'), h('span', {}, `Downloading ${u.version || 'update'}… ${u.percent || 0}%`));
    } else if (u.state === 'ready') {
      pill.replaceChildren(
        h('span.update-dot'),
        h('span', {}, `Burrow ${u.version} is ready`),
        h('button.update-btn', { onClick: confirmInstall }, 'Restart'));
    }
  }
  function confirmInstall() {
    const { close } = B.modal(h('div', {},
      h('header', {}, `Update to Burrow ${B.update.version}?`),
      h('div.body', { style: { color: 'var(--text-2)' } },
        'Burrow will close, update and open again. Running agents will stop, so finish or pause them first. Your projects and sessions are kept (Claude sessions continue with --continue).'),
      h('footer', {},
        h('button.btn', { onClick: () => close() }, 'Later'),
        h('button.btn.primary', { onClick: () => { close(); burrow.installUpdate(); } }, 'Restart and update'))));
  }
  burrow.onUpdate((u) => {
    B.update = u;
    renderUpdate();
  });
  renderUpdate();

  burrow.onAgents((list) => {
    B.agents = list;
  });
  burrow.onState((state) => {
    B.state = state;
    renderAll();
  });
  burrow.onStatus((id, status) => {
    if (B.statuses[id] === status) return;
    B.statuses[id] = status;
    B.panes.trackStatus(id, status);
    B.sidebar.render();
    B.panes.render();
  });
  burrow.onUnread((id, kind) => {
    B.unread[id] = kind;
    B.sidebar.render();
  });
  burrow.onToast((text) => B.toast(text.includes(' → ') ? `<b>MCP</b> ${B.esc(text)}` : B.esc(text)));

  buildChrome();
  renderAll();
  appReady = true;
  pendingOpens.splice(0).forEach(([projectId, rel]) => B.editor.open(projectId, rel));
  B.focusTerminal();
})();
