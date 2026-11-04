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
  const pct = (n) => (n > 0 && n < 0.01 ? `${(n * 100).toFixed(1)}%` : `${Math.round(n * 100)}%`);
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

  const SPARK = '▁▂▃▄▅▆▇█';
  /** One character per value, eight heights. */
  const spark = (values) => {
    const max = Math.max(...values);
    return values.map((v) => (v && max ? SPARK[Math.max(0, Math.ceil((v / max) * 8) - 1)] : ' ')).join('');
  };

  // Stacked day bar: each kind of token gets its own shade, so the mix shows at a glance.
  const KINDS = [
    ['output', '█', 'u-k-out'],
    ['input', '▓', 'u-k-in'],
    ['cacheWrite', '▒', 'u-k-cw'],
    ['cacheRead', '░', 'u-k-cr'],
  ];
  function stacked(day, max, width = BAR) {
    if (!max || !day.total) return [' '.repeat(width)];
    const cells = Math.max(1, Math.round((day.total / max) * width));
    const parts = KINDS.map(([k]) => day[k] || 0);
    // every kind that is present gets at least one cell, the rest is shared by size
    let left = cells;
    const n = parts.map((v) => (v ? 1 : 0));
    left -= n.reduce((a, b) => a + b, 0);
    if (left < 0) return [h('span.u-k-cr', {}, '░'.repeat(cells).padEnd(width))];
    const share = parts.map((v) => (v / day.total) * left);
    const whole = share.map(Math.floor);
    let rest = left - whole.reduce((a, b) => a + b, 0);
    share.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
      if (rest > 0 && parts[i]) { whole[i]++; rest--; }
    });
    const out = KINDS.map(([, ch, cls], i) => (n[i] + whole[i] ? h(`span.${cls}`, {}, ch.repeat(n[i] + whole[i])) : null)).filter(Boolean);
    out.push(' '.repeat(width - cells));
    return out;
  }

  /** A small column chart, several rows tall, built from eighth blocks (like a terminal plot). */
  function columns(values, rows = 5, colWidth = 2) {
    const max = Math.max(...values) || 1;
    const lines = [];
    for (let r = rows - 1; r >= 0; r--) {
      lines.push(values.map((v) => {
        const fill = (v / max) * rows - r; // how much of this row the column covers
        const ch = !v ? (r === 0 ? '·' : ' ') : fill >= 1 ? '█' : fill > 0 ? SPARK[Math.max(0, Math.round(fill * 8) - 1)] : ' ';
        return ch.repeat(colWidth - 1) + (colWidth > 1 ? ' ' : '');
      }).join(''));
    }
    return lines;
  }

  const HEAT = [' ', '·', '░', '▒', '▓', '█'];
  /** Square-root scale so quiet hours still show next to busy ones. */
  const heatChar = (v, max) => (v && max ? HEAT[Math.min(5, 1 + Math.floor(Math.sqrt(v / max) * 4.999))] : HEAT[0]);
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const shortDay = (day) => new Date(`${day}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const hourLabel = (hr) => `${String(hr).padStart(2, '0')}:00`;

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
    if (d.prevTotal != null) {
      const before = RANGE_LABEL[view.range].replace('last ', '').replace('today', 'day');
      if (!d.prevTotal) out.push(line(dim(`nothing in the ${before} before, so no comparison yet`)));
      else {
        const change = (t.total - d.prevTotal) / d.prevTotal;
        const up = change >= 0;
        out.push(line(h(`span.${up ? 'u-up' : 'u-down'}`, {}, `${up ? '▲' : '▼'} ${pct(Math.abs(change))}`), dim(` vs the ${before} before (${fmt(d.prevTotal)})`)));
      }
    }
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

    const st = d.stats;
    out.push(blank(), rule('AT A GLANCE'));
    const pair = (k1, v1, k2, v2) => line(dim(pad(k1, 17)), pad(v1, 18), dim(pad(k2, 14)), v2);
    out.push(pair('avg / active day', fmt(st.avgPerDay), 'busiest day', st.busiest ? `${shortDay(st.busiest.day)} · ${fmt(st.busiest.total)}` : '—'));
    out.push(pair('active days', view.range === 'all' ? String(st.activeDays) : `${st.activeDays} of ${{ today: 1, '7d': 7, '30d': 30 }[view.range]}`, 'streak', st.streak ? `${st.streak} day${st.streak > 1 ? 's' : ''} in a row` : '—'));
    out.push(pair('per reply', fmt(st.perReply), 'peak hour', st.peakHour == null ? '—' : `${hourLabel(st.peakHour)}–${hourLabel((st.peakHour + 1) % 24)}`));
    out.push(pair('output share', pct(t.output / t.total), 'cache saved', `${fmt(t.cacheRead)} tokens reused`));

    out.push(blank(), rule('LAST 30 DAYS'));
    const tr = d.trend.map((x) => x.total);
    const cols = columns(tr, 5, 2);
    const maxT = Math.max(...tr);
    cols.forEach((row, i) => out.push(line(dim(padL(i === 0 ? fmt(maxT) : i === cols.length - 1 ? '0' : '', 7)), dim(' ┤ '), barEl(row))));
    out.push(line(dim(`${' '.repeat(10)}${pad(shortDay(d.trend[0].day), 30)}${padL('today', 29)}`)));

    out.push(blank(), rule(`PER DAY · last ${d.days.length} days`));
    out.push(line(dim(pad('', 13)), h('span.u-k-out', {}, '█'), dim(' output  '), h('span.u-k-in', {}, '▓'), dim(' input  '),
      h('span.u-k-cw', {}, '▒'), dim(' cache write  '), h('span.u-k-cr', {}, '░'), dim(' cache read')));
    const maxDay = Math.max(...d.days.map((x) => x.total));
    for (const x of d.days) {
      out.push(line(dim(pad(shortDay(x.day), 13)), ...stacked(x, maxDay), '  ', x.total ? padL(fmt(x.total), 7) : dim(padL('·', 7))));
    }

    if (d.hours.some(Boolean)) {
      out.push(blank(), rule('WHEN YOU WORK · weekday × hour'));
      const maxHeat = Math.max(...d.heat.flat());
      const axis = Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? String(i).padEnd(2) : '  ')).join('');
      out.push(line(dim(pad('', 6)), dim(axis)));
      d.heat.forEach((row, i) => {
        out.push(line(dim(pad(WEEKDAYS[i], 6)), h('span.u-heat', {}, row.map((v) => heatChar(v, maxHeat).repeat(2)).join('')),
          dim(`  ${row.some(Boolean) ? fmt(row.reduce((a, b) => a + b, 0)) : '·'}`)));
      });
      out.push(line(dim(pad('all', 6)), barEl(spark(d.hours).split('').map((c) => c + c).join('')), dim(st.peakHour == null ? '' : `  peak ${hourLabel(st.peakHour)}`)));
      out.push(line(dim(pad('', 6)), dim('quiet '), h('span.u-heat', {}, HEAT.slice(1).join(' ')), dim(' busy')));
    }

    out.push(blank(), rule('PROJECTS'));
    for (const p of d.projects) {
      out.push(line(h('span', { title: p.cwd || '' }, pad(p.name, 22)), barEl(bar(p.total, d.projects[0].total, 20)), '  ', padL(fmt(p.total), 7), dim(`  ${padL(pct(p.total / t.total), 4)}`)));
    }

    out.push(blank(), rule('MODELS'));
    for (const m of d.models) {
      out.push(line(pad(m.key, 22), barEl(bar(m.total, d.models[0].total, 20)), '  ', padL(fmt(m.total), 7), dim(`  ${padL(pct(m.total / t.total), 4)}  out ${fmt(m.output)}`)));
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
