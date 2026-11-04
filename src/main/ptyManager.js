'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const pty = require('node-pty');
const { Terminal: Headless } = require('@xterm/headless');
const { stripAnsi, extractTitle, computeStatus, atPrompt } = require('./status');

const SCROLLBACK_BYTES = 1_000_000;
const TAIL_CHARS = 6000;
const TICK_MS = 400;

/**
 * Owns all live terminals. Emits:
 *  data(id, chunk) · status(id, status, prev) · title(id, title) · exit(id, code)
 */
class PtyManager extends EventEmitter {
  constructor() {
    super();
    this.terms = new Map();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.agentOf = () => 'shell'; // main sets this: which agent runs in a terminal
  }

  has(id) {
    return this.terms.has(id);
  }

  spawn(id, { file, args, cwd, env, cols = 100, rows = 30 }) {
    if (this.terms.has(id)) return;
    const safeCwd = cwd && fs.existsSync(cwd) ? cwd : process.env.USERPROFILE;
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: safeCwd,
      env: { ...process.env, ...env, TERM_PROGRAM: 'Burrow', COLORTERM: 'truecolor' },
      useConpty: true,
    });
    // A headless copy of the screen, so status comes from what is visible now, not old output.
    const screen = new Headless({ cols, rows, scrollback: 200, allowProposedApi: true });
    const term = { proc, screen, buffer: '', tail: '', lastOutput: 0, lastInput: 0, lastEnter: 0, marks: {}, status: 'idle', exited: false };
    this.terms.set(id, term);

    const live = () => this.terms.get(id) === term;
    proc.onData((chunk) => {
      if (!live()) return;
      term.buffer = (term.buffer + chunk).slice(-SCROLLBACK_BYTES);
      term.tail = (term.tail + stripAnsi(chunk)).slice(-TAIL_CHARS);
      term.lastOutput = Date.now();
      screen.write(chunk);
      if (chunk.includes('\n')) term.marks.linesSinceEnter = (term.marks.linesSinceEnter || 0) + 1;
      const title = extractTitle(chunk);
      if (title) this.emit('title', id, title);
      if (chunk.includes('\x07') && !/\x1b\][^\x07]*\x07/.test(chunk)) this.setStatus(id, term, 'attention');
      this.emit('data', id, chunk);
    });
    proc.onExit(({ exitCode }) => {
      term.exited = true;
      if (!live()) return;
      this.setStatus(id, term, 'exited');
      this.emit('exit', id, exitCode);
    });
  }

  write(id, data) {
    const term = this.terms.get(id);
    if (!term || term.exited) return false;
    term.lastInput = Date.now();
    term.proc.write(data);
    if (data.includes('\r')) {
      term.lastEnter = term.lastInput;
      const buf = term.screen.buffer.active;
      term.marks.enterRow = buf.baseY + buf.cursorY;
      term.marks.linesSinceEnter = 0;
      this.emit('enter', id);
    }
    return true;
  }

  /** Type text into a TUI and press enter after it has absorbed the paste. */
  sendText(id, text, submit = true) {
    if (!this.write(id, text)) return false;
    if (submit) setTimeout(() => this.write(id, '\r'), 180);
    return true;
  }

  resize(id, cols, rows) {
    const term = this.terms.get(id);
    if (!term || term.exited || cols < 2 || rows < 2) return;
    try {
      term.proc.resize(cols, rows);
      term.screen.resize(cols, rows);
    } catch {
      /* resizing a dying pty can throw; harmless */
    }
  }

  buffer(id) {
    return this.terms.get(id)?.buffer || '';
  }

  readText(id, maxLines = 80) {
    const tail = this.terms.get(id)?.tail || '';
    return tail.split(/\r?\n/).filter((l) => l.trim()).slice(-maxLines).join('\n');
  }

  /** Shell pids of live terminals, keyed by session id. */
  pids() {
    const out = {};
    for (const [id, term] of this.terms) if (!term.exited) out[id] = term.proc.pid;
    return out;
  }

  statusOf(id) {
    return this.terms.get(id)?.status || 'dormant';
  }

  kill(id) {
    const term = this.terms.get(id);
    if (!term) return;
    this.terms.delete(id);
    term.screen.dispose();
    try {
      term.proc.kill();
    } catch {
      /* already gone */
    }
  }

  killAll() {
    clearInterval(this.timer);
    for (const id of [...this.terms.keys()]) this.kill(id);
  }

  /** Visible text right now, and the line the cursor sits on. */
  screenOf(term) {
    const buf = term.screen.buffer.active;
    const lines = [];
    for (let y = 0; y < term.screen.rows; y++) lines.push(buf.getLine(buf.viewportY + y)?.translateToString(true) || '');
    // The cursor's whole logical line: in a narrow pane a long prompt wraps onto several rows.
    let cursorLine = '';
    for (let y = buf.baseY + buf.cursorY; y >= 0; y--) {
      const line = buf.getLine(y);
      if (!line) break;
      cursorLine = line.translateToString(y === buf.baseY + buf.cursorY) + cursorLine;
      if (!line.isWrapped) break;
    }
    // A prompt counts as "back" only on a different line from where Enter was pressed.
    const row = buf.baseY + buf.cursorY;
    const moved = row !== term.marks.enterRow || term.marks.linesSinceEnter > 0;
    if (atPrompt(cursorLine) && moved) term.marks.promptSeen = Date.now();
    return { screen: lines.join('\n'), cursorLine, fullscreen: buf.type === 'alternate' };
  }

  statusInput(id, term, now) {
    return { now, ...term, ...this.screenOf(term), agent: this.agentOf(id), exited: false };
  }

  setStatus(id, term, status) {
    if (term.status === status) return;
    const prev = term.status;
    term.status = status;
    this.emit('status', id, status, prev);
  }

  tick() {
    const now = Date.now();
    for (const [id, term] of this.terms) {
      if (term.exited) continue;
      // A bell-triggered attention state sticks until new output or input arrives.
      if (term.status === 'attention' && now - Math.max(term.lastOutput, term.lastInput) > 700) {
        const next = computeStatus(this.statusInput(id, term, now));
        if (next === 'idle') continue;
      }
      this.setStatus(id, term, computeStatus(this.statusInput(id, term, now)));
    }
  }
}

module.exports = { PtyManager };
