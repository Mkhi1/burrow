'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reduce, initialState, normalize } = require('../src/main/reducer');
const { extractTitle, computeStatus, stripAnsi } = require('../src/main/status');
const { buildLaunch, findAgent } = require('../src/main/agents');

const withProject = () => reduce(initialState(), { type: 'project/add', path: 'C:\\code\\app', id: 'p1' });
const addSession = (s, id) => reduce(s, { type: 'session/create', projectId: 'p1', agent: 'claude', id });

test('adding the same folder twice is a no-op', () => {
  const s = withProject();
  assert.equal(reduce(s, { type: 'project/add', path: 'c:\\CODE\\app' }), s);
  assert.equal(s.projects[0].name, 'app');
});

test('creating a session shows it in the current page', () => {
  const s = addSession(withProject(), 's1');
  assert.deepEqual(s.pages[0].panes, ['s1']);
  assert.equal(s.pages[0].focus, 's1');
});

test('showing a session replaces the focused pane, split adds a pane', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'session/create', projectId: 'p1', agent: 'codex', id: 's2', show: false });
  s = reduce(s, { type: 'pane/split', sessionId: 's2', dir: 'col' });
  assert.deepEqual(s.pages[0].panes, ['s1', 's2']);
  assert.equal(s.pages[0].dir, 'col');
  s = addSession(s, 's3');
  assert.deepEqual(s.pages[0].panes, ['s1', 's3']);
});

test('showing a session that lives on another page switches page', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'page/add' });
  assert.equal(s.settings.page, 1);
  s = reduce(s, { type: 'session/show', id: 's1' });
  assert.equal(s.settings.page, 0);
});

test('removing a project drops its sessions and panes', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'project/remove', id: 'p1' });
  assert.equal(s.sessions.length, 0);
  assert.deepEqual(s.pages[0].panes, []);
  assert.equal(s.pages[0].focus, null);
});

test('auto titles never override a custom title', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'session/autotitle', id: 's1', title: 'Fix tests' });
  assert.equal(s.sessions[0].title, 'Fix tests');
  s = reduce(s, { type: 'session/rename', id: 's1', title: 'Mine' });
  s = reduce(s, { type: 'session/autotitle', id: 's1', title: 'Other' });
  assert.equal(s.sessions[0].title, 'Mine');
});

test('reducer does not mutate input', () => {
  const s = Object.freeze(withProject());
  assert.doesNotThrow(() => addSession(s, 's1'));
});

test('normalize survives garbage', () => {
  assert.equal(normalize('nope').pages.length, 1);
  assert.equal(normalize({ settings: { fontSize: 15 } }).settings.fontSize, 15);
});

test('extractTitle reads OSC titles and skips shell noise', () => {
  assert.equal(extractTitle('\x1b]0;✳ Add dark-mode tokens\x07'), 'Add dark-mode tokens');
  assert.equal(extractTitle('\x1b]2;C:\\WINDOWS\\system32\\pwsh.exe\x07'), null);
  assert.equal(extractTitle('\x1b]0;Claude Code\x07'), null);
  assert.equal(extractTitle('plain text'), null);
});

test('stripAnsi removes colors', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
});

test('computeStatus', () => {
  const now = 10_000;
  assert.equal(computeStatus({ now, lastOutput: now - 100, lastInput: 0, tail: '', exited: false }), 'busy');
  assert.equal(computeStatus({ now, lastOutput: now - 100, lastInput: now - 200, tail: '', exited: false }), 'idle');
  assert.equal(computeStatus({ now, lastOutput: now - 5000, lastInput: 0, tail: '', exited: false }), 'idle');
  assert.equal(computeStatus({ now, lastOutput: now - 1000, lastInput: 0, tail: 'Do you want to proceed?\n❯ 1. Yes', exited: false }), 'attention');
  assert.equal(computeStatus({ now, lastOutput: now - 2000, lastInput: 0, tail: '· Thinking… (esc to interrupt)', exited: false }), 'busy');
  assert.equal(computeStatus({ now, lastOutput: 0, lastInput: 0, tail: '', exited: true }), 'exited');
});

test('buildLaunch wraps agents in the shell and adds MCP config for Claude', () => {
  const l = buildLaunch('pwsh.exe', findAgent('claude'), { resume: true, mcpConfigPath: 'C:\\a b\\m.json', extraArgs: ["it's"] });
  assert.equal(l.file, 'pwsh.exe');
  assert.equal(l.args.at(-1), "& claude --continue 'it''s' --mcp-config 'C:\\a b\\m.json'");
  assert.deepEqual(buildLaunch('pwsh.exe', findAgent('shell')).args, ['-NoLogo']);
});

const { aggregate } = require('../src/main/usageAggregate');

test('aggregate sums buckets inside the range only', () => {
  const now = new Date(2026, 10, 2, 12);
  const summaries = [
    { agent: 'claude', cwd: 'C:/code/app', session: 'a', title: 'Fix bug', last: '2026-11-02T10:00:00Z',
      buckets: { '2026-11-02|opus': [10, 20, 70, 5, 2], '2026-10-01|opus': [1000, 0, 0, 0, 1] } },
    { agent: 'codex', cwd: 'C:/code/web', session: 'b', title: 'Tests', last: '2026-11-01T10:00:00Z',
      buckets: { '2026-11-01|gpt': [100, 0, 0, 50, 1] } },
  ];
  const week = aggregate(summaries, { range: '7d', now });
  assert.equal(week.totals.total, 255);
  assert.equal(week.totals.sessions, 2);
  assert.equal(week.projects[0].name, 'web');
  assert.equal(week.days.length, 7);
  assert.equal(week.days.at(-1).total, 105);
  assert.equal(aggregate(summaries, { range: 'today', now }).totals.total, 105);
  assert.equal(aggregate(summaries, { range: 'all', now }).totals.total, 1255);
  assert.equal(aggregate(summaries, { range: '7d', agent: 'codex', now }).totals.total, 150);
  const hit = aggregate(summaries, { range: 'today', now }).cacheHit;
  assert.equal(hit, 0.7);
});

test('pane sizes persist until the layout changes', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'session/create', projectId: 'p1', agent: 'shell', id: 's2', show: false });
  s = reduce(s, { type: 'pane/split', sessionId: 's2', dir: 'row' });
  s = reduce(s, { type: 'pane/sizes', sizes: [0.7, 0.3] });
  assert.deepEqual(s.pages[0].sizes, [0.7, 0.3]);
  assert.equal(reduce(s, { type: 'pane/sizes', sizes: [1] }), s); // wrong length ignored
  assert.equal(reduce(s, { type: 'pane/sizes', sizes: [1, -1] }), s); // invalid ignored
  s = reduce(s, { type: 'pane/close', sessionId: 's2' });
  assert.equal(s.pages[0].sizes, undefined);
});

test('findOnPath finds .cmd shims and ignores missing tools', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { findOnPath } = require('../src/main/agents');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'burrow-'));
  fs.writeFileSync(path.join(dir, 'opencode.cmd'), '@echo off');
  assert.equal(findOnPath('opencode', `C:/nope;${dir}`), path.join(dir, 'opencode.cmd'));
  assert.equal(findOnPath('missing-tool', dir), null);
  fs.rmSync(dir, { recursive: true });
});
