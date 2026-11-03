'use strict';

// Simple editor: one card per file, syntax colors, Ctrl+S, live reload,
// and a Markdown preview (because agents mostly write .md files).
(() => {
  const { h, icons } = B;
  const PREFIX = 'edit:';
  const editors = new Map(); // paneId -> editor state
  const modes = new Map(); // rel -> 'edit' | 'split' | 'preview' (remembered per file)
  const recent = []; // recently opened "projectId:rel"

  const isEditorId = (id) => typeof id === 'string' && id.startsWith(PREFIX);
  const makeId = (projectId, rel) => `${PREFIX}${projectId}:${rel}`;
  function parse(id) {
    const rest = id.slice(PREFIX.length);
    const i = rest.indexOf(':');
    return { projectId: rest.slice(0, i), rel: rest.slice(i + 1) };
  }
  const projectOf = (projectId) => B.state.projects.find((p) => p.id === projectId);
  const isOpenable = (id) => isEditorId(id) && Boolean(projectOf(parse(id).projectId));
  const isMd = (rel) => /\.(md|markdown|mdx)$/i.test(rel);

  // ---------- look (matches DESIGN.md) ----------

  const theme = CM.EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent', color: '#d9dbe0', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-content': { caretColor: '#fff', padding: '6px 0 40px' },
    '.cm-cursor': { borderLeftColor: '#fff', borderLeftWidth: '2px' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#4b5059', border: 'none', paddingRight: '6px' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#a9adb5' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.035)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(120,150,255,.28) !important' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(255,255,255,.08)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(255,255,255,.12)', outline: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-panels': { backgroundColor: '#121214', color: '#e6e7ea', borderTop: '1px solid rgba(255,255,255,.08)' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'var(--ui-font)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(240,179,90,.25)' },
    '.cm-searchMatch-selected': { backgroundColor: 'rgba(240,179,90,.5)' },
  }, { dark: true });

  const t = CM.tags;
  const highlight = CM.HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: '#c49bff' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#7bd88f' },
    { tag: [t.number, t.bool, t.null, t.atom], color: '#f0b35a' },
    { tag: [t.comment, t.lineComment, t.blockComment, t.meta], color: '#6c717b', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#78b6ff' },
    { tag: [t.typeName, t.className, t.namespace], color: '#5fd0e0' },
    { tag: [t.propertyName, t.attributeName], color: '#d7b8ff' },
    { tag: [t.tagName], color: '#ff8787' },
    { tag: t.heading1, color: '#ffffff', fontWeight: '700', fontSize: '1.25em' },
    { tag: t.heading2, color: '#ffffff', fontWeight: '700', fontSize: '1.12em' },
    { tag: [t.heading3, t.heading4, t.heading5, t.heading6, t.heading], color: '#ffffff', fontWeight: '700' },
    { tag: t.strong, fontWeight: '700', color: '#ffffff' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: [t.link, t.url], color: '#78b6ff' },
    { tag: [t.monospace], color: '#f0b35a' },
    { tag: [t.quote], color: '#a9adb5', fontStyle: 'italic' },
    { tag: [t.list, t.processingInstruction, t.contentSeparator], color: '#6c717b' },
  ]);

  function languageFor(rel) {
    const ext = (rel.split('.').pop() || '').toLowerCase();
    if (['js', 'mjs', 'cjs'].includes(ext)) return CM.javascript();
    if (ext === 'jsx') return CM.javascript({ jsx: true });
    if (ext === 'ts') return CM.javascript({ typescript: true });
    if (ext === 'tsx') return CM.javascript({ typescript: true, jsx: true });
    if (['md', 'markdown', 'mdx'].includes(ext)) return CM.markdown();
    if (['py', 'pyw'].includes(ext)) return CM.python();
    if (['json', 'jsonc'].includes(ext)) return CM.json();
    if (['css', 'scss', 'less'].includes(ext)) return CM.css();
    if (['html', 'htm', 'svg', 'xml', 'vue'].includes(ext)) return CM.html();
    return [];
  }

  // ---------- open / close ----------

  async function open(projectId, rel) {
    const id = makeId(projectId, rel);
    const key = `${projectId}:${rel}`;
    if (recent.includes(key)) recent.splice(recent.indexOf(key), 1);
    recent.unshift(key);
    recent.length = Math.min(recent.length, 20);
    if (B.usage?.isOpen()) B.usage.close();
    await burrow.dispatch({ type: 'pane/open', paneId: id });
    setTimeout(() => focus(id), 80);
  }

  function close(id) {
    const ed = editors.get(id);
    const finish = () => {
      B.closePane(id);
      setTimeout(() => B.panes.forget(id), 400);
    };
    if (!ed?.dirty) return finish();
    const { close: closeModal } = B.modal(h('div', {},
      h('header', {}, 'Save changes?'),
      h('div.body', { style: { color: 'var(--text-2)' } }, `“${ed.rel}” has unsaved changes.`),
      h('footer', {},
        h('button.btn', { onClick: () => { closeModal(); finish(); } }, "Don't save"),
        h('button.btn', { onClick: () => closeModal() }, 'Cancel'),
        h('button.btn.primary', { onClick: async () => { closeModal(); if (await save(id)) finish(); } }, 'Save'))));
  }

  function dispose(id) {
    const ed = editors.get(id);
    if (!ed) return;
    ed.view?.destroy();
    burrow.unwatchFile(ed.projectId, ed.rel);
    editors.delete(id);
  }

  function focus(id) {
    const ed = editors.get(id);
    if (!ed) return;
    if (ed.mode === 'preview') ed.preview.focus();
    else ed.view?.focus();
  }

  // ---------- the card ----------

  function buildPane(id) {
    const { projectId, rel } = parse(id);
    const name = rel.split('/').pop();
    const dir = rel.slice(0, rel.length - name.length).replace(/\/$/, '');
    const md = isMd(rel);
    const dirtyDot = h('span.dirty-dot', { title: 'Unsaved changes' });
    const title = h('span.title', { title: rel }, name, dir ? h('span.edit-dir', {}, `  ${dir}`) : null, dirtyDot);
    const brand = h('span.brand', { html: icons.file });

    const modeBtns = md
      ? h('div.seg', {}, ...[['edit', 'Edit'], ['split', 'Both'], ['preview', 'Preview']].map(([m, label]) =>
          h('button.seg-btn', { 'data-mode': m, onClick: () => setMode(id, m) }, label)))
      : null;
    const tools = h('div.tools', {},
      modeBtns,
      h('button.icon-btn', { html: icons.check, title: 'Save (Ctrl+S)', onClick: () => save(id) }),
      h('button.icon-btn', { html: icons.close, title: 'Close (Esc)', onClick: () => close(id) }));
    const head = h('div.pane-head', {}, brand, title, tools);

    const banner = h('div.edit-banner');
    const cmHost = h('div.cm-host');
    const preview = h('article.md-preview', { tabindex: '-1' });
    const status = h('div.edit-status');
    const body = h('div.edit-body', {}, cmHost, preview);
    const el = h('section.pane.editor-pane', { 'data-id': id }, head, banner, body, status);

    const ed = { id, projectId, rel, md, el, cmHost, preview, banner, status, dirtyDot, modeBtns, view: null, dirty: false, mode: md ? (modes.get(rel) || 'split') : 'edit' };
    editors.set(id, ed);
    load(ed);
    // Shape expected by panes.js (timer parts are unused for files).
    return { el, title, brand, body, overlay: h('div'), timer: h('span'), timerText: h('span') };
  }

  async function load(ed) {
    ed.status.textContent = 'Opening…';
    ed.status.classList.add('show');
    let file;
    try {
      file = await burrow.readFile(ed.projectId, ed.rel);
    } catch (err) {
      ed.cmHost.replaceChildren(h('div.edit-error', {}, `Can't open this file: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`));
      ed.status.classList.remove('show');
      return;
    }
    const save = () => {
      saveFile(ed.id);
      return true;
    };
    ed.view = new CM.EditorView({
      parent: ed.cmHost,
      state: CM.EditorState.create({
        doc: file.text,
        extensions: [
          CM.lineNumbers(),
          CM.highlightActiveLineGutter(),
          CM.highlightActiveLine(),
          CM.drawSelection(),
          CM.history(),
          CM.indentOnInput(),
          CM.bracketMatching(),
          CM.highlightSelectionMatches(),
          CM.EditorView.lineWrapping,
          languageFor(ed.rel),
          CM.syntaxHighlighting(highlight),
          theme,
          CM.keymap.of([
            { key: 'Mod-s', run: save, preventDefault: true },
            { key: 'Mod-Shift-v', run: () => (cycleMode(ed.id), true) },
            ...CM.searchKeymap,
            ...CM.historyKeymap,
            ...CM.defaultKeymap,
            CM.indentWithTab,
            { key: 'Escape', run: () => (close(ed.id), true) },
          ]),
          CM.EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            if (!ed.applyingDisk) setDirty(ed, true);
            schedulePreview(ed);
          }),
        ],
      }),
    });
    ed.preview.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(ed.id);
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') cycleMode(ed.id);
    });
    ed.preview.addEventListener('click', (e) => onPreviewClick(ed, e));
    applyMode(ed);
    renderPreview(ed);
    ed.status.classList.remove('show');
    burrow.watchFile(ed.projectId, ed.rel);
  }

  function setDirty(ed, dirty) {
    ed.dirty = dirty;
    ed.dirtyDot.classList.toggle('on', dirty);
  }

  // ---------- save + live reload ----------

  async function saveFile(id) {
    const ed = editors.get(id);
    if (!ed?.view) return false;
    try {
      await burrow.writeFile(ed.projectId, ed.rel, ed.view.state.doc.toString());
      setDirty(ed, false);
      ed.banner.classList.remove('show');
      flash(ed, 'Saved');
      return true;
    } catch (err) {
      B.toast(`Couldn't save: ${B.esc(String(err.message || err))}`);
      return false;
    }
  }
  const save = saveFile;

  function flash(ed, text) {
    ed.status.textContent = text;
    ed.status.classList.add('show');
    clearTimeout(ed.flashTimer);
    ed.flashTimer = setTimeout(() => ed.status.classList.remove('show'), 1400);
  }

  function replaceDoc(ed, text) {
    const view = ed.view;
    const scroll = view.scrollDOM.scrollTop;
    const head = Math.min(view.state.selection.main.head, text.length);
    ed.applyingDisk = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head } });
    ed.applyingDisk = false;
    view.scrollDOM.scrollTop = scroll;
  }

  burrow.onFileChanged(async (projectId, rel) => {
    for (const ed of editors.values()) {
      if (ed.projectId !== projectId || ed.rel !== rel || !ed.view) continue;
      let file;
      try {
        file = await burrow.readFile(projectId, rel);
      } catch {
        continue;
      }
      if (file.text === ed.view.state.doc.toString()) continue; // our own save
      if (!ed.dirty) {
        replaceDoc(ed, file.text);
        flash(ed, 'Updated from disk');
        continue;
      }
      // You have unsaved edits and the agent changed the file too: let you choose.
      ed.banner.replaceChildren(
        h('span', {}, 'This file changed on disk.'),
        h('button.link-btn', { onClick: () => { replaceDoc(ed, file.text); setDirty(ed, false); ed.banner.classList.remove('show'); } }, 'Load theirs'),
        h('button.link-btn', { onClick: () => ed.banner.classList.remove('show') }, 'Keep mine'));
      ed.banner.classList.add('show');
    }
  });

  // ---------- markdown preview ----------

  function setMode(id, mode) {
    const ed = editors.get(id);
    if (!ed) return;
    ed.mode = mode;
    modes.set(ed.rel, mode);
    applyMode(ed);
    renderPreview(ed);
    focus(id);
  }

  function cycleMode(id) {
    const ed = editors.get(id);
    if (!ed?.md) return;
    const order = ['edit', 'split', 'preview'];
    setMode(id, order[(order.indexOf(ed.mode) + 1) % order.length]);
  }

  function applyMode(ed) {
    ed.el.dataset.mode = ed.mode;
    ed.modeBtns?.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === ed.mode));
  }

  function schedulePreview(ed) {
    if (!ed.md || ed.mode === 'edit') return;
    clearTimeout(ed.previewTimer);
    ed.previewTimer = setTimeout(() => renderPreview(ed), 120);
  }

  const toFileUrl = (abs) => `file:///${abs.replace(/\\/g, '/').replace(/^\/+/, '')}`;

  function resolveRel(fromRel, href) {
    const parts = fromRel.split('/').slice(0, -1);
    for (const seg of href.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  }

  function renderPreview(ed) {
    if (!ed.md || !ed.view || ed.mode === 'edit') return;
    const scroll = ed.preview.scrollTop;
    const html = marked.parse(ed.view.state.doc.toString(), { gfm: true, breaks: false });
    ed.preview.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['checked'] });
    // Task checkboxes become clickable and write back to the file.
    ed.preview.querySelectorAll('input[type="checkbox"]').forEach((box, i) => {
      box.removeAttribute('disabled');
      box.dataset.task = String(i);
    });
    // Local images point at the real file on disk.
    const root = projectOf(ed.projectId)?.path || '';
    ed.preview.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (!/^(https?:|data:|file:)/i.test(src)) img.src = toFileUrl(`${root}/${resolveRel(ed.rel, decodeURI(src))}`);
    });
    ed.preview.scrollTop = scroll;
  }

  const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/gm;

  function onPreviewClick(ed, e) {
    const box = e.target.closest('input[data-task]');
    if (box) {
      const n = Number(box.dataset.task);
      const text = ed.view.state.doc.toString();
      let i = -1;
      const next = text.replace(TASK_RE, (all, a, mark, c) => (++i === n ? `${a}${mark === ' ' ? 'x' : ' '}${c}` : all));
      if (next !== text) {
        ed.view.dispatch({ changes: { from: 0, to: ed.view.state.doc.length, insert: next } });
        saveFile(ed.id);
      }
      return;
    }
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    if (/^https?:/i.test(href)) burrow.openExternal(href);
    else if (href.startsWith('#')) ed.preview.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ behavior: 'smooth' });
    else open(ed.projectId, resolveRel(ed.rel, decodeURI(href.split('#')[0])));
  }

  // ---------- quick open (Ctrl+Shift+F) ----------

  const listCache = new Map(); // projectId -> { at, files }

  async function filesOf(projectId) {
    const hit = listCache.get(projectId);
    if (hit && Date.now() - hit.at < 10000) return hit.files;
    const list = await burrow.listFiles(projectId);
    listCache.set(projectId, { at: Date.now(), files: list });
    return list;
  }

  const AGENT_DOC = /(^|\/)(claude|agents|readme|todo|design|plan|spec|changelog)[^/]*\.md$|^\.claude\/.*\.md$|^docs\/[^/]*\.md$/i;

  /** Fuzzy score: every query char in order; bonus for name hits and runs. -1 = no match. */
  function score(query, rel) {
    if (!query) return 0;
    const s = rel.toLowerCase();
    const name = s.slice(s.lastIndexOf('/') + 1);
    let qi = 0;
    let points = 0;
    let run = 0;
    for (let i = 0; i < s.length && qi < query.length; i++) {
      if (s[i] === query[qi]) {
        qi++;
        run++;
        points += 1 + run;
      } else run = 0;
    }
    if (qi < query.length) return -1;
    if (name.includes(query)) points += 40 + (name.startsWith(query) ? 20 : 0);
    return points - rel.length * 0.05;
  }

  function currentProjectId() {
    const focus = B.panes.currentPage().focus;
    if (isEditorId(focus)) return parse(focus).projectId;
    return B.sessionById(focus)?.projectId || B.state.projects[0]?.id;
  }

  async function quickOpen(projectId = currentProjectId()) {
    if (!projectId) return B.addProject();
    const projects = B.state.projects;
    let pIndex = Math.max(projects.findIndex((p) => p.id === projectId), 0);
    let files = [];
    let items = [];
    let active = 0;
    const input = h('input.input', { placeholder: 'Type a file name…  (Tab: switch project)', spellcheck: 'false' });
    const chip = h('span.qo-project');
    const results = h('div.results');

    async function loadProject() {
      chip.textContent = projects[pIndex].name;
      results.replaceChildren(h('div.qo-empty', {}, 'Reading files…'));
      files = await filesOf(projects[pIndex].id);
      draw();
    }

    function draw() {
      const q = input.value.toLowerCase().replace(/\\/g, '/').trim();
      const pid = projects[pIndex].id;
      if (!q) {
        const rec = recent.filter((k) => k.startsWith(`${pid}:`)).map((k) => k.slice(pid.length + 1));
        const docs = files.filter((f) => AGENT_DOC.test(f) && !rec.includes(f));
        items = [...rec.map((f) => ({ rel: f, tag: 'recent' })), ...docs.map((f) => ({ rel: f, tag: 'agent doc' }))].slice(0, 40);
        if (items.length < 40) items.push(...files.filter((f) => !rec.includes(f) && !AGENT_DOC.test(f)).slice(0, 40 - items.length).map((rel) => ({ rel })));
      } else {
        items = files
          .map((rel) => ({ rel, s: score(q, rel) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 60);
      }
      active = Math.min(active, Math.max(items.length - 1, 0));
      results.replaceChildren(...(items.length ? items.map((it, i) => {
        const name = it.rel.split('/').pop();
        const dir = it.rel.slice(0, it.rel.length - name.length);
        return h('div.item', { class: i === active ? 'active' : '', onMousemove: () => { if (active !== i) { active = i; draw(); } }, onClick: () => pick(i) },
          h('span', { html: icons.file }),
          h('span.title', {}, name, h('span.edit-dir', {}, `  ${dir}`)),
          it.tag ? h('span.meta', {}, it.tag) : null);
      }) : [h('div.qo-empty', {}, files.length ? 'No matching files' : 'This folder has no files')]));
      results.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
    }

    function pick(i) {
      const it = items[i];
      if (!it) return;
      close();
      open(projects[pIndex].id, it.rel);
    }

    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = (active + 1) % Math.max(items.length, 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % Math.max(items.length, 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter') pick(active);
      if (e.key === 'Tab' && projects.length > 1) {
        e.preventDefault();
        pIndex = (pIndex + (e.shiftKey ? -1 : 1) + projects.length) % projects.length;
        active = 0;
        loadProject();
      }
      if (e.key === 'Escape') close();
    });
    const { close } = B.modal(h('div', {}, h('div.qo-head', {}, chip, input), results), { className: 'palette' });
    loadProject();
  }

  B.editor = { isEditorId, isOpenable, open, buildPane, dispose, focus, quickOpen, close, score };
})();
