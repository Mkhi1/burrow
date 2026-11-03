'use strict';

// Menus and modal dialogs: new session, settings, quick switcher.
(() => {
  const { h, icons, menu, modal } = B;

  async function addProject() {
    const project = await burrow.pickProject();
    if (project) B.toast(`Added <b>${B.esc(project.name)}</b>`);
    return project;
  }

  const installedAgents = () => B.agents.filter((a) => a.installed);

  /** Re-scan installed agents (fast: reads PATH folders, no extra processes). */
  async function checkAgents({ announce = false } = {}) {
    const before = new Set(B.agents.filter((a) => a.installed).map((a) => a.id));
    B.agents = await burrow.refreshAgents();
    const found = B.agents.filter((a) => a.installed && !before.has(a.id));
    if (found.length) B.toast(`Found <b>${found.map((a) => B.esc(a.name)).join(', ')}</b>`);
    else if (announce) B.toast(`${B.agents.filter((a) => a.installed && a.bin).length} agents ready`);
    return B.agents;
  }

  /** Small agent picker anchored to a button; creates a session in that project. */
  function quickNew(projectId, anchor, { split } = {}) {
    const items = () => [
      { heading: 'Start an agent' },
      ...B.agents.map((a) => ({
        label: a.name,
        icon: B.agentIcon(a.id),
        // Missing agents can still be tried: the terminal shows the real error if it's not there.
        hint: a.installed ? (a.id === B.state.settings.defaultAgent ? 'default' : '') : 'not found · try',
        onClick: () => createSession({ projectId, agent: a.id, split }),
      })),
      'sep',
      { label: 'Check agents again', icon: icons.restart, onClick: () => checkAgents({ announce: true }).then(() => quickNew(projectId, anchor, { split })) },
      { label: 'More options…', icon: icons.edit, onClick: () => newSessionDialog({ projectId, split }) },
    ];
    menu(items(), anchor);
    // Refresh in the background; redraw the menu if something changed.
    const snapshot = JSON.stringify(B.agents.map((a) => a.installed));
    checkAgents().then(() => {
      if (JSON.stringify(B.agents.map((a) => a.installed)) !== snapshot && document.querySelector('.menu')) menu(items(), anchor);
    });
  }

  async function createSession({ projectId, agent, title, prompt, split }) {
    const session = await burrow.newSession({ projectId, agent, title, prompt, show: !split });
    if (split) await burrow.dispatch({ type: 'pane/split', sessionId: session.id, dir: split });
    B.clearUnread(session.id);
    setTimeout(() => B.terminals.focus(session.id), 60);
    return session;
  }

  function newSessionDialog({ projectId, split } = {}) {
    if (!B.state.projects.length) return addProject().then((p) => p && newSessionDialog({ projectId: p.id, split }));
    const focused = B.sessionById(B.panes.currentPage().focus);
    let chosenProject = projectId || focused?.projectId || B.state.projects[0].id;
    let chosenAgent = B.state.settings.defaultAgent;
    if (!B.agentById(chosenAgent).installed) chosenAgent = installedAgents()[0]?.id || 'shell';

    const projectSelect = h('select.select', {
      onChange: async (e) => {
        if (e.target.value !== '__add') return (chosenProject = e.target.value);
        const p = await addProject();
        if (p) chosenProject = p.id;
        fillProjects();
      },
    });
    const fillProjects = () => {
      projectSelect.replaceChildren(
        ...B.state.projects.map((p) => h('option', { value: p.id, selected: p.id === chosenProject }, `${p.name}  —  ${p.path}`)),
        h('option', { value: '__add' }, '+ Add folder…'));
      projectSelect.value = chosenProject;
    };
    fillProjects();

    const chips = h('div.chips');
    const fillChips = () =>
      chips.replaceChildren(...B.agents.map((a) =>
        h('button.chip', {
          class: `${a.id === chosenAgent ? 'on' : ''} ${a.installed ? '' : 'missing'}`,
          title: a.installed ? `${a.name} — ${a.location}` : `${a.bin} was not found — you can still try it`,
          onClick: () => {
            chosenAgent = a.id;
            fillChips();
          },
        }, h('span', { html: B.agentIcon(a.id) }), a.name, a.installed ? null : h('span.note', {}, 'not found'))));
    fillChips();
    const recheck = h('button.link-btn', { onClick: async () => {
      recheck.textContent = 'checking…';
      await checkAgents({ announce: true });
      recheck.textContent = '↻ check again';
      fillChips();
    } }, '↻ check again');
    checkAgents().then(fillChips);

    const titleInput = h('input.input', { placeholder: 'Optional — the agent names it automatically' });
    const promptInput = h('textarea.textarea', { placeholder: 'Optional first message, e.g. "fix the failing tests"' });
    const submit = async () => {
      close();
      await createSession({
        projectId: chosenProject,
        agent: chosenAgent,
        title: titleInput.value.trim() || undefined,
        prompt: promptInput.value.trim() || undefined,
        split,
      });
    };
    const content = h('div', {
      onKeydown: (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.target.tagName !== 'TEXTAREA')) {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') close();
      },
    },
    h('header', {}, split ? 'New session in a split' : 'New session'),
    h('div.body', {},
      h('div.field', {}, h('label', {}, 'Project'), projectSelect),
      h('div.field', {}, h('label.row-label', {}, 'Agent', recheck), chips),
      h('div.field', {}, h('label', {}, 'Title'), titleInput),
      h('div.field', {}, h('label', {}, 'First prompt'), promptInput)),
    h('footer', {},
      h('button.btn', { onClick: () => close() }, 'Cancel'),
      h('button.btn.primary', { onClick: submit }, 'Start ', h('kbd', {}, 'Enter'))));
    const { close } = modal(content);
    setTimeout(() => promptInput.focus(), 30);
  }

  function sessionMenu(id, at, inPane = false) {
    const session = B.sessionById(id);
    if (!session) return;
    const status = B.statuses[id] || 'dormant';
    const running = status !== 'dormant' && status !== 'exited';
    const page = B.panes.currentPage();
    menu([
      { label: 'Rename', icon: icons.edit, hint: 'F2', onClick: () => renameSession(id, inPane) },
      { label: session.pinned ? 'Unpin' : 'Pin to top', icon: icons.pin, onClick: () => burrow.dispatch({ type: 'session/pin', id }) },
      'sep',
      { label: 'Open in split', icon: icons.splitRight, disabled: page.panes.includes(id),
        onClick: () => burrow.dispatch({ type: 'pane/split', sessionId: id, dir: 'row' }) },
      { label: 'Close pane', icon: icons.close, hint: 'Ctrl Shift W', disabled: !page.panes.includes(id),
        onClick: () => B.closePane(id) },
      'sep',
      { label: running ? 'Restart' : 'Resume', icon: icons.restart, onClick: () => restartSession(id) },
      { label: 'Stop process', icon: icons.stop, disabled: !running, onClick: () => burrow.stopSession(id) },
      { label: 'Open folder', icon: icons.open, onClick: () => burrow.openProject(session.projectId) },
      'sep',
      { label: 'Delete session', icon: icons.trash, danger: true, onClick: () => confirmDelete(id) },
    ], at);
  }

  async function restartSession(id) {
    await burrow.dispatch({ type: 'session/show', id });
    if (B.terminals.has(id)) B.terminals.restart(id);
  }

  function renameSession(id, inPane) {
    const session = B.sessionById(id);
    if (!inPane && document.querySelector(`.session[data-id="${id}"]`)) return B.sidebar.startRename(id);
    const input = h('input.input', { value: session.title });
    const save = () => {
      const title = input.value.trim();
      if (title) burrow.dispatch({ type: 'session/rename', id, title });
      close();
    };
    const { close } = modal(h('div', { onKeydown: (e) => e.key === 'Enter' && save() },
      h('header', {}, 'Rename session'),
      h('div.body', {}, input),
      h('footer', {}, h('button.btn', { onClick: () => close() }, 'Cancel'), h('button.btn.primary', { onClick: save }, 'Save'))));
    setTimeout(() => input.select(), 30);
  }

  function confirmDelete(id) {
    const session = B.sessionById(id);
    const remove = () => {
      close();
      burrow.removeSession(id);
      B.panes.forget(id);
    };
    const { close } = modal(h('div', {},
      h('header', {}, 'Delete session?'),
      h('div.body', { style: { color: 'var(--text-2)' } }, `“${session.title}” will be stopped and removed from the sidebar. Files in the project are not touched.`),
      h('footer', {}, h('button.btn', { onClick: () => close() }, 'Cancel'), h('button.btn.primary', { onClick: remove, style: { background: '#e5534b', color: 'white' } }, 'Delete'))));
  }

  function projectMenu(id, at) {
    const project = B.state.projects.find((p) => p.id === id);
    menu([
      { label: 'New session…', icon: icons.plus, onClick: () => newSessionDialog({ projectId: id }) },
      { label: 'Open file…', icon: icons.file, hint: 'Ctrl Shift F', onClick: () => B.editor.quickOpen(id) },
      ...installedAgents().slice(0, 4).map((a) => ({
        label: `Start ${a.name}`, icon: B.agentIcon(a.id), onClick: () => createSession({ projectId: id, agent: a.id }),
      })),
      'sep',
      { heading: 'Folder color' },
      { swatches: FOLDER_COLORS, current: project.color || null, onPick: (color) => burrow.dispatch({ type: 'project/color', id, color }) },
      'sep',
      { label: 'Open in Explorer', icon: icons.open, onClick: () => burrow.openProject(id) },
      { label: 'Rename', icon: icons.edit, onClick: () => {
        const input = h('input.input', { value: project.name });
        const save = () => {
          if (input.value.trim()) burrow.dispatch({ type: 'project/rename', id, name: input.value.trim() });
          close();
        };
        const { close } = modal(h('div', { onKeydown: (e) => e.key === 'Enter' && save() },
          h('header', {}, 'Rename project'), h('div.body', {}, input),
          h('footer', {}, h('button.btn', { onClick: () => close() }, 'Cancel'), h('button.btn.primary', { onClick: save }, 'Save'))));
      } },
      'sep',
      { label: 'Remove from Burrow', icon: icons.trash, danger: true, onClick: () => {
        B.state.sessions.filter((s) => s.projectId === id).forEach((s) => B.panes.forget(s.id));
        burrow.removeProject(id);
      } },
    ], at);
  }

  function splitWithNew(dir, anchor) {
    const focused = B.sessionById(B.panes.currentPage().focus);
    if (B.panes.currentPage().panes.length >= 4) return B.toast('A page holds up to 4 panes — try a new page');
    const projectId = focused?.projectId || B.state.projects[0]?.id;
    if (!projectId) return addProject();
    if (anchor) quickNew(projectId, anchor, { split: dir });
    else createSession({ projectId, agent: focused?.agent || B.state.settings.defaultAgent, split: dir });
  }

  function addMenu(anchor) {
    menu([
      { label: 'New session…', icon: icons.plus, hint: 'Ctrl Shift N', onClick: () => newSessionDialog() },
      { label: 'Add project folder…', icon: icons.folder, hint: 'Ctrl Shift O', onClick: addProject },
      { label: 'Open file…', icon: icons.file, hint: 'Ctrl Shift F', onClick: () => B.editor.quickOpen() },
      { label: 'New page', icon: icons.page, onClick: () => burrow.dispatch({ type: 'page/add' }) },
      'sep',
      { label: B.state.settings.notifications ? 'Mute notifications' : 'Unmute notifications', icon: icons.stop,
        onClick: () => {
          const on = !B.state.settings.notifications;
          burrow.dispatch({ type: 'settings/update', patch: { notifications: on } });
          B.toast(on ? 'Notifications on' : 'Notifications muted');
        } },
    ], anchor);
  }

  const FOLDER_COLORS = [
    { name: 'None', value: null }, { name: 'Red', value: '#f87171' }, { name: 'Orange', value: '#fb923c' },
    { name: 'Yellow', value: '#facc15' }, { name: 'Green', value: '#4ade80' }, { name: 'Teal', value: '#2dd4bf' },
    { name: 'Blue', value: '#60a5fa' }, { name: 'Purple', value: '#a78bfa' }, { name: 'Pink', value: '#f472b6' },
  ];

  // ---------- settings ----------

  const ACCENTS = ['#f2f2f2', '#a1a1aa', '#7bd88f', '#5aa2ff', '#a78bfa', '#f472b6'];
  const MATERIALS = [['acrylic', 'Acrylic blur'], ['mica', 'Mica'], ['tabbed', 'Tabbed'], ['none', 'Solid']];

  function settingsDialog() {
    const body = h('div.body');
    const set = (patch) => burrow.dispatch({ type: 'settings/update', patch }).then(draw);
    const toggle = (on, fn) => h('button.toggle', { class: on ? 'on' : '', onClick: fn });

    function draw() {
      const st = B.state.settings;
      // hidden optional rows are null; replaceChildren would print them as text
      body.replaceChildren(...[
        h('div.section-title', {}, 'Appearance'),
        h('div.setting-row', {}, h('div', {}, 'Motion', h('div.desc', {}, 'Animations, spinners and moving themes')),
          h('div.chips', {}, ...[['on', 'Always on'], ['system', 'Follow Windows']].map(([v, l]) =>
            h('button.chip', { class: (st.motion || 'on') === v ? 'on' : '', onClick: () => set({ motion: v }) }, l)))),
        h('div.field', {}, h('label', {}, 'Theme (animated background)'),
          h('div.chips', {}, ...B.scenes.list().map((sc) => h('button.chip', { class: (st.scene || 'none') === sc.id ? 'on' : '', onClick: () => set({ scene: sc.id }) }, sc.name)))),
        st.scene && st.scene !== 'none' ? h('div.setting-row', {}, h('div', {}, 'Art strength', h('div.desc', {}, 'How bright the animation is')),
          h('input', { type: 'range', min: '0.2', max: '1', step: '0.05', value: st.sceneStrength ?? 1, onInput: (e) => set({ sceneStrength: Number(e.target.value) }) })) : null,
        st.scene && st.scene !== 'none' ? h('div.setting-row', {}, h('div', {}, 'See-through cards', h('div.desc', {}, 'Show the animation softly behind terminals and editors')),
          toggle(st.glassCards, () => set({ glassCards: !st.glassCards }))) : null,
        h('div.setting-row', {}, h('div', {}, 'Window background', h('div.desc', {}, 'Blur what is behind the window (Windows 11)')),
          h('div.chips', {}, ...MATERIALS.map(([v, l]) => h('button.chip', { class: st.material === v ? 'on' : '', onClick: () => set({ material: v }) }, l)))),
        h('div.setting-row', {}, h('div', {}, 'Tint', h('div.desc', {}, 'How dark the glass is')),
          h('input', { type: 'range', min: '0.15', max: '0.95', step: '0.05', value: st.tint, onInput: (e) => set({ tint: Number(e.target.value) }) })),
        h('div.setting-row', {}, h('div', {}, 'Accent'),
          h('div.chips', {}, ...ACCENTS.map((c) => h('button.swatch', { class: st.accent === c ? 'on' : '', style: { background: c }, onClick: () => set({ accent: c }) })))),
        h('div.setting-row', {}, h('div', {}, 'Terminal font size'),
          h('div.chips', {},
            h('button.chip', { onClick: () => set({ fontSize: Math.max(9, st.fontSize - 1) }) }, '−'),
            h('span', { style: { minWidth: '28px', textAlign: 'center', alignSelf: 'center' } }, st.fontSize),
            h('button.chip', { onClick: () => set({ fontSize: Math.min(24, st.fontSize + 1) }) }, '+'))),
        h('div.field', {}, h('label', {}, 'Terminal font family'),
          h('input.input', { value: st.fontFamily, onChange: (e) => e.target.value.trim() && set({ fontFamily: e.target.value.trim() }) })),
        h('div.section-title', {}, 'Agents'),
        h('div.setting-row', {}, h('div', {}, 'Default agent'),
          h('select.select', { style: { width: '180px' }, onChange: (e) => set({ defaultAgent: e.target.value }) },
            ...B.agents.map((a) => h('option', { value: a.id, selected: a.id === st.defaultAgent }, a.name + (a.installed ? '' : ' (not found)'))))),
        h('div.setting-row', {}, h('div', {}, 'Agent messaging (MCP)', h('div.desc', {}, 'Gives Claude Code sessions tools to list, read and message other sessions')),
          toggle(st.mcp, () => set({ mcp: !st.mcp }))),
        h('div.setting-row', {}, h('div', {}, 'Notifications', h('div.desc', {}, 'When an agent finishes or needs approval')),
          toggle(st.notifications, () => set({ notifications: !st.notifications }))),
        h('div.setting-row', {}, h('div', {}, 'Installed agents'),
          h('button.btn', { onClick: async () => { await checkAgents({ announce: true }); draw(); } }, 'Check agents')),
        h('div.section-title', {}, 'Updates'),
        h('div.setting-row', {}, h('div', {}, `Burrow ${B.update?.current || ''}`, h('div.desc', {}, updateText())),
          h('button.btn', { onClick: async () => { await burrow.checkUpdate(); setTimeout(draw, 1500); } }, 'Check now')),
        h('div.section-title', {}, 'Shortcuts'),
        h('div.shortcuts', {}, ...SHORTCUTS.flatMap(([k, d]) => [h('span', {}, d), h('kbd', {}, k)]))].filter(Boolean));
    }
    draw();
    modal(h('div', {}, h('header', {}, 'Settings'), body, h('footer.credit', {}, 'Developed by MK')));
  }

  function updateText() {
    const u = B.update || {};
    return {
      dev: 'Updates are off while running from source',
      checking: 'Checking…',
      latest: 'You have the latest version',
      downloading: `Downloading ${u.version}… ${u.percent || 0}%`,
      ready: `${u.version} is ready — restart from the sidebar`,
      error: u.error === 'offline' ? "Couldn't check (no internet?)" : `Couldn't check: ${u.error}`,
    }[u.state] || 'Checks automatically every few hours';
  }

  const SHORTCUTS = [
    ['Ctrl Shift N', 'New session'], ['Ctrl Shift O', 'Add project'], ['Ctrl Shift P', 'Jump to session'], ['Ctrl Shift B', 'Toggle sidebar'],
    ['Ctrl Shift D', 'Split right'], ['Ctrl Shift E', 'Split down'], ['Ctrl Shift W', 'Close pane'], ['Ctrl 1…9', 'Go to session'],
    ['Ctrl Tab', 'Next session'], ['Ctrl Alt ← →', 'Switch page'], ['Ctrl + / −', 'Font size'], ['F2', 'Rename session'],
    ['Ctrl Shift U', 'Token usage'], ['Ctrl Shift F', 'Open file'], ['Ctrl S', 'Save file'], ['Ctrl Shift V', 'Markdown preview'], ['F11', 'Full screen'], ['Drag divider', 'Resize panes'], ['Shift Enter', 'Newline in prompt'], ['Ctrl ,', 'Settings'],
  ];

  // ---------- quick switcher ----------

  function palette() {
    const input = h('input.input', { placeholder: 'Jump to a session or run a command…', spellcheck: 'false' });
    const results = h('div.results');
    let active = 0;
    let items = [];
    const commands = [
      { title: 'New session', meta: 'Ctrl Shift N', icon: icons.plus, run: () => newSessionDialog() },
      { title: 'Add project folder', meta: 'Ctrl Shift O', icon: icons.folder, run: addProject },
      { title: 'Open file', meta: 'Ctrl Shift F', icon: icons.file, run: () => B.editor.quickOpen() },
      { title: 'New page', meta: '', icon: icons.page, run: () => burrow.dispatch({ type: 'page/add' }) },
      { title: 'Token usage', meta: 'Ctrl Shift U', icon: icons.chart, run: () => B.usage.open() },
      { title: 'Settings', meta: 'Ctrl ,', icon: icons.gear, run: settingsDialog },
    ];
    const draw = () => {
      const q = input.value.toLowerCase().trim();
      const sessions = B.state.sessions.map((s) => ({
        title: s.title,
        meta: `${B.state.projects.find((p) => p.id === s.projectId)?.name || ''} · ${B.statuses[s.id] || 'dormant'}`,
        icon: B.agentIcon(B.agentOf(s)),
        run: () => B.showSession(s.id),
      }));
      items = [...sessions, ...commands].filter((it) => !q || `${it.title} ${it.meta}`.toLowerCase().includes(q));
      active = Math.min(active, Math.max(items.length - 1, 0));
      results.replaceChildren(...items.map((it, i) =>
        h('div.item', { class: i === active ? 'active' : '', onMousemove: () => { if (active !== i) { active = i; draw(); } }, onClick: () => pick(i) },
          h('span', { html: it.icon }), h('span.title', {}, it.title), h('span.meta', {}, it.meta))));
    };
    const pick = (i) => {
      const it = items[i];
      close();
      it?.run();
    };
    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = (active + 1) % Math.max(items.length, 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % Math.max(items.length, 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter') pick(active);
      if (e.key === 'Escape') close();
    });
    draw();
    const { close } = modal(h('div', {}, input, results), { className: 'palette' });
  }

  Object.assign(B, { checkAgents, addProject, quickNew, newSessionDialog, sessionMenu, projectMenu, splitWithNew, addMenu, settingsDialog, palette, createSession });
})();
