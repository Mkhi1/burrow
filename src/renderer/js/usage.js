'use strict';

// Token usage page, drawn like terminal output: text bars, box rules, a prompt line.
(() => {
  const { h, icons } = B;
  const BAR = 28;
  const view = { open: false, range: '7d', agent: 'all', data: null, progress: null, animate: true };

  const fmt = (n) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return String(Math.round(n));
  };
  const pct = (n) => `${Math.round(n * 100)}%`;
  const pad = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  const padL = (s, n) => s.padStart(n);

  /** Eighth-block bar so small values still show a sliver. */
  function bar(value, max, width = BAR) {
    if (!max || !value) return ' '.repeat(width);
    const eighths = Math.max(1, Math.round((value / max) * width * 8));
    const full = Math.floor(eighths / 8);
    const part = ' ▏▎▍▌▋▊▉'[eighths % 8];
    return ('█'.repeat(full) + (eighths % 8 ? part : '')).padEnd(width);
  }

  const ago = (iso) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${Math.max(m, 0)}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
  };

  const RANGE_LABEL = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days', all: 'all time' };

  // ---------- line builders ----------

  const line = (...parts) => h('div.u-line', {}, ...parts);
  const dim = (t) => h('span.u-dim', {}, t);
  const bright = (t) => h('span.u-bright', {}, t);
  const barEl = (t) => h('span.u-bar', {}, t);
  const rule = (title) => line(bright(title), dim(` ${'─'.repeat(Math.max(4, 58 - title.length))}`));
  const blank = () => line(' ');
  const opt = (label, on, fn) => h('button.u-opt', { class: on ? 'on' : '', onClick: fn }, `[${label}]`);

  function controls() {
    return line(
      dim('range  '),
      ...['today', '7d', '30d', 'all'].flatMap((r) => [opt(r, view.range === r, () => setOpt({ range: r })), ' ']),
      dim('   agent  '),
      ...['all', 'claude', 'codex'].flatMap((a) => [opt(a, view.agent === a, () => setOpt({ agent: a })), ' ']),
      '   ',
      h('button.u-opt', { onClick: rescan, title: 'Re-read transcripts' }, '↻ refresh'));
  }

  function body(d) {
    const t = d.totals;
    const out = [];
    out.push(line(dim('~ '), bright('burrow usage'), dim(` --range ${view.range} --agent ${view.agent}`)));
    out.push(blank(), controls(), blank());

    if (!t.total) {
      out.push(line(dim(view.progress ? 'Reading transcripts…' : 'No token usage found for this range.')));
      out.push(line(dim('Usage comes from Claude Code (~/.claude/projects) and Codex (~/.codex/sessions) logs.')));
      return out;
    }

    out.push(rule(`TOTAL · ${RANGE_LABEL[view.range]}`));
    out.push(line(bright(fmt(t.total)), dim(' tokens   '), `${t.messages.toLocaleString()}`, dim(' replies   '), `${t.sessions}`, dim(' sessions')));
    out.push(blank());
    const parts = [
      ['input', t.input, 'new text sent to the model'],
      ['output', t.output, 'what the agent wrote back'],
      ['cache write', t.cacheWrite, 'context saved for reuse'],
      ['cache read', t.cacheRead, 'context reused (cheap + fast)'],
    ];
    const maxPart = Math.max(...parts.map((p) => p[1]));
    for (const [label, value, help] of parts) {
      out.push(line(pad(label, 13), padL(fmt(value), 8), '  ', barEl(bar(value, maxPart, 20)), '  ', dim(help)));
    }
    out.push(blank());
    out.push(line(pad('cache hit', 13), padL(pct(d.cacheHit), 8), '  ', barEl(bar(d.cacheHit, 1, 20)), '  ',
      dim(d.cacheHit > 0.8 ? 'great — most context is reused' : d.cacheHit > 0.5 ? 'ok' : 'low — sessions restart often')));
    if (d.agents.length > 1) {
      out.push(blank());
      for (const a of d.agents) out.push(line(pad(a.key, 13), padL(fmt(a.total), 8), '  ', barEl(bar(a.total, t.total, 20)), '  ', dim(pct(a.total / t.total))));
    }

    out.push(blank(), rule(`PER DAY · last ${d.days.length} days`));
    const maxDay = Math.max(...d.days.map((x) => x.total));
    for (const x of d.days) {
      const date = new Date(`${x.day}T00:00`);
      const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      out.push(line(dim(pad(label, 13)), barEl(bar(x.total, maxDay)), '  ', x.total ? padL(fmt(x.total), 7) : dim(padL('·', 7))));
    }

    out.push(blank(), rule('PROJECTS'));
    for (const p of d.projects) {
      out.push(line(h('span', { title: p.cwd || '' }, pad(p.name, 22)), barEl(bar(p.total, d.projects[0].total, 20)), '  ', padL(fmt(p.total), 7), dim(`  ${padL(pct(p.total / t.total), 4)}`)));
    }

    out.push(blank(), rule('MODELS'));
    for (const m of d.models) {
      out.push(line(pad(m.key, 22), barEl(bar(m.total, d.models[0].total, 20)), '  ', padL(fmt(m.total), 7), dim(`  out ${fmt(m.output)}`)));
    }

    out.push(blank(), rule('TOP SESSIONS'));
    d.sessions.forEach((s, i) => {
      out.push(line(dim(`${i + 1}  `), h('span', { title: s.title }, pad(s.title, 40)), ' ', dim(pad(s.agent, 7)), dim(pad(s.project, 14)), padL(fmt(s.total), 7), dim(`  ${ago(s.last)}`)));
    });
    return out;
  }

  // ---------- render ----------

  function render() {
    const el = document.getElementById('usage');
    document.getElementById('app').classList.toggle('usage-open', view.open);
    if (!view.open) return;
    const status = view.progress
      ? dim(`reading ${view.progress.done}/${view.progress.total} transcripts…`)
      : dim('↑↓ scroll · esc to close');
    const term = h('div.u-term', {}, ...(view.data ? body(view.data) : [line(dim('loading…'))]),
      blank(), line(bright('❯ '), h('span.u-cursor')));
    const head = h('div.pane-head', {},
      h('span.brand', { html: icons.chart }),
      h('span.title', {}, 'Token usage'),
      h('span.u-status', {}, status),
      h('div.tools', {}, h('button.icon-btn', { html: icons.close, title: 'Close (Esc)', onClick: close })));
    const scroll = el.querySelector('.u-term')?.scrollTop || 0;
    el.replaceChildren(head, term);
    if (view.animate && !B.reduceMotion) {
      [...term.children].forEach((c, i) => {
        c.style.animationDelay = `${Math.min(i * 14, 600)}ms`;
        c.classList.add('typed');
      });
      view.animate = false;
    } else term.scrollTop = scroll;
  }

  async function load() {
    view.data = await burrow.getUsage({ range: view.range, agent: view.agent });
    render();
  }

  function setOpt(patch) {
    Object.assign(view, patch, { animate: true });
    load();
  }

  function rescan() {
    view.progress = { done: 0, total: 0 };
    render();
    burrow.scanUsage();
  }

  function open() {
    view.open = true;
    view.animate = true;
    render();
    load();
    rescan();
  }

  function close() {
    view.open = false;
    render();
    B.terminals.refitAll();
    B.focusTerminal();
  }

  burrow.onUsageProgress((done, total) => {
    view.progress = { done, total };
    if (!view.open) return;
    // Refresh numbers as batches land so the page fills in while scanning.
    if (done % 100 === 0) load();
    else render();
  });
  burrow.onUsageUpdated(() => {
    view.progress = null;
    if (view.open) load();
  });

  B.usage = { open, close, toggle: () => (view.open ? close() : open()), isOpen: () => view.open };
})();
