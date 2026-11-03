'use strict';

// One xterm per session, kept alive while hidden so scrollback survives switching.
(() => {
  const THEME = {
    background: '#0c0c0d',
    foreground: '#d9dbe0',
    cursor: '#e6e7ea',
    cursorAccent: '#0c0c0d',
    selectionBackground: 'rgba(120, 150, 255, 0.28)',
    black: '#2a2b30', red: '#ff6b6b', green: '#7bd88f', yellow: '#f0b35a',
    blue: '#4c9dff', magenta: '#c49bff', cyan: '#5fd0e0', white: '#d9dbe0',
    brightBlack: '#6c717b', brightRed: '#ff8787', brightGreen: '#97e8a8', brightYellow: '#ffcc80',
    brightBlue: '#78b6ff', brightMagenta: '#d7b8ff', brightCyan: '#8ce3ee', brightWhite: '#ffffff',
  };

  const terms = new Map();
  const seeThrough = () => document.body.classList.contains('glass-cards');
  const themeNow = () => ({ ...THEME, background: seeThrough() ? 'rgba(0,0,0,0)' : THEME.background });
  let lastSeeThrough = null;

  function create(id) {
    const settings = B.state.settings;
    const term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: 1.22,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      allowTransparency: true,
      scrollback: 10000,
      theme: themeNow(),
      macOptionIsMeta: true,
      windowsPty: { backend: 'conpty' },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon.WebLinksAddon((_e, url) => burrow.openExternal(url)));
    const host = B.h('div.term-host');
    const entry = { id, term, fit, host, opened: false, pending: false, lastSize: '' };

    term.onData((data) => burrow.write(id, data));
    term.onBinary((data) => burrow.write(id, data));
    term.attachCustomKeyEventHandler((e) => handleKey(entry, e));
    host.addEventListener('mousedown', () => B.focusPane?.(id));
    new ResizeObserver(() => scheduleFit(entry)).observe(host);
    terms.set(id, entry);
    return entry;
  }

  function handleKey(entry, e) {
    if (e.type !== 'keydown') return true;
    if (B.isAppShortcut?.(e)) return false;
    const { term } = entry;
    const ctrl = e.ctrlKey && !e.altKey;
    if (ctrl && e.key.toLowerCase() === 'c' && (e.shiftKey || term.hasSelection())) {
      if (term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        e.preventDefault();
        return false;
      }
    }
    if (ctrl && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => text && term.paste(text));
      return false;
    }
    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
      // Newline inside agent prompts without submitting.
      burrow.write(entry.id, '\x1b\r');
      e.preventDefault();
      return false;
    }
    return true;
  }

  function scheduleFit(entry) {
    cancelAnimationFrame(entry.raf);
    entry.raf = requestAnimationFrame(() => fitNow(entry));
  }

  function fitNow(entry) {
    if (!entry.opened || !entry.host.isConnected || entry.host.clientWidth < 20) return;
    if (document.body.matches('.resizing-row, .resizing-col') || document.getElementById('app').classList.contains('resizing')) return;
    try {
      entry.fit.fit();
    } catch {
      return;
    }
    const size = `${entry.term.cols}x${entry.term.rows}`;
    if (size !== entry.lastSize) {
      entry.lastSize = size;
      burrow.resize(entry.id, entry.term.cols, entry.term.rows);
    }
  }

  /** Mount a session's terminal into a container, starting its process if needed. */
  async function attach(id, container) {
    const entry = terms.get(id) || create(id);
    if (entry.host.parentElement !== container) {
      container.append(entry.host);
      if (!B.reduceMotion) entry.host.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    if (!entry.opened) {
      entry.term.open(entry.host);
      try {
        const webgl = new WebglAddon.WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        entry.term.loadAddon(webgl);
      } catch {
        /* falls back to the DOM renderer */
      }
      entry.opened = true;
      entry.fit.fit();
      entry.pending = true;
      const buffer = await burrow.ensureSession(id, entry.term.cols, entry.term.rows);
      entry.pending = false;
      if (buffer) entry.term.write(buffer);
      entry.lastSize = '';
    }
    scheduleFit(entry);
    return entry;
  }

  async function restart(id) {
    const entry = terms.get(id);
    if (!entry) return;
    entry.term.reset();
    await burrow.restartSession(id, entry.term.cols, entry.term.rows);
  }

  // Output that arrives while the initial buffer is loading is already in that buffer.
  burrow.onData((id, chunk) => {
    const entry = terms.get(id);
    if (entry && entry.opened && !entry.pending) entry.term.write(chunk);
  });

  function focus(id) {
    terms.get(id)?.term.focus();
  }

  function dispose(id) {
    const entry = terms.get(id);
    if (!entry) return;
    entry.term.dispose();
    entry.host.remove();
    terms.delete(id);
  }

  function applySettings() {
    const { fontSize, fontFamily } = B.state.settings;
    if (lastSeeThrough !== seeThrough()) {
      lastSeeThrough = seeThrough();
      for (const entry of terms.values()) entry.term.options.theme = themeNow();
    }
    for (const entry of terms.values()) {
      if (entry.term.options.fontSize === fontSize && entry.term.options.fontFamily === fontFamily) continue;
      entry.term.options.fontSize = fontSize;
      entry.term.options.fontFamily = fontFamily;
      scheduleFit(entry);
    }
  }

  const refitAll = () => terms.forEach(scheduleFit);

  B.terminals = { attach, restart, focus, dispose, applySettings, refitAll, has: (id) => terms.has(id) };
})();
