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
  assert.equal(s.pages[0].tree.dir, 'col');
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
  assert.equal(computeStatus({ now, lastOutput: now - 100, lastInput: 0, exited: false }), 'busy');
  assert.equal(computeStatus({ now, lastOutput: now - 100, lastInput: now - 200, exited: false }), 'idle');
  assert.equal(computeStatus({ now, lastOutput: now - 5000, lastInput: 0, exited: false }), 'idle');
  assert.equal(computeStatus({ now, lastOutput: now - 1000, lastInput: 0, screen: 'Do you want to proceed?\n❯ 1. Yes', exited: false }), 'attention');
  assert.equal(computeStatus({ now, lastOutput: 0, lastInput: 0, exited: true }), 'exited');
});

test('agents are working only while their working line is on screen', () => {
  const marks = {};
  const base = { lastOutput: 9_900, lastInput: 0, agent: 'claude', exited: false, marks };
  assert.equal(computeStatus({ ...base, now: 10_000, screen: '✻ Thinking… (5s · esc to interrupt)' }), 'busy');
  // still redrawing its idle screen, but the working line is gone: done
  assert.equal(computeStatus({ ...base, now: 11_500, lastOutput: 11_450, screen: '> ' }), 'idle');
});

test('a shell command is working until the prompt comes back', () => {
  const marks = { promptSeen: 1_000 };
  const base = { lastInput: 2_000, lastEnter: 2_000, agent: 'shell', exited: false, marks };
  // a slow download that prints nothing for a while is still running
  assert.equal(computeStatus({ ...base, now: 9_000, lastOutput: 3_000, cursorLine: 'Downloading 45%' }), 'busy');
  // the prompt came back on a new line (the terminal manager records that as promptSeen)
  assert.equal(computeStatus({ ...base, marks: { promptSeen: 9_400 }, now: 9_500, lastOutput: 8_000, cursorLine: 'PS C:\\x> ' }), 'idle');
  // full-screen apps (vim, less) fall back to output timing
  assert.equal(computeStatus({ ...base, fullscreen: true, now: 9_000, lastOutput: 3_000 }), 'idle');
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
  s = reduce(s, { type: 'pane/sizes', path: [], sizes: [0.7, 0.3] });
  assert.deepEqual(s.pages[0].tree.sizes, [0.7, 0.3]);
  assert.equal(reduce(s, { type: 'pane/sizes', path: [], sizes: [1] }), s); // wrong length ignored
  assert.equal(reduce(s, { type: 'pane/sizes', path: [], sizes: [1, -1] }), s); // invalid ignored
  assert.equal(reduce(s, { type: 'pane/sizes', path: [5], sizes: [1, 1] }), s); // no such split
  s = reduce(s, { type: 'pane/close', sessionId: 's2' });
  assert.equal(s.pages[0].tree, 's1');
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

test('folder colors accept hex or null only', () => {
  let s = withProject();
  s = reduce(s, { type: 'project/color', id: 'p1', color: '#4ade80' });
  assert.equal(s.projects[0].color, '#4ade80');
  assert.equal(reduce(s, { type: 'project/color', id: 'p1', color: 'red;}' }), s);
  s = reduce(s, { type: 'project/color', id: 'p1', color: null });
  assert.equal(s.projects[0].color, null);
});

const { matchProcess, agentsUnder } = require('../src/main/agentDetect');

test('matchProcess recognises agents by exe or npm package', () => {
  assert.equal(matchProcess('claude.exe', 'claude.exe --continue'), 'claude');
  assert.equal(matchProcess('node.exe', 'node C:/npm/node_modules/@anthropic-ai/claude-code/cli.js'), 'claude');
  assert.equal(matchProcess('node.exe', 'node C:/npm/node_modules/@openai/codex/bin/codex.js'), 'codex');
  assert.equal(matchProcess('opencode.exe', 'opencode'), 'opencode');
  assert.equal(matchProcess('git.exe', 'git status'), null);
  assert.equal(matchProcess('node.exe', 'node claudette.js'), null);
});

test('agentsUnder finds an agent anywhere below each shell', () => {
  const ps = [
    { pid: 10, ppid: 1, name: 'pwsh.exe', cmd: 'pwsh' },
    { pid: 11, ppid: 10, name: 'cmd.exe', cmd: 'cmd /c claude.cmd' },
    { pid: 12, ppid: 11, name: 'node.exe', cmd: 'node @anthropic-ai/claude-code/cli.js' },
    { pid: 20, ppid: 1, name: 'pwsh.exe', cmd: 'pwsh' },
    { pid: 21, ppid: 20, name: 'git.exe', cmd: 'git log' },
  ];
  assert.deepEqual(agentsUnder(ps, [10, 20, 99]), { 10: 'claude', 20: null, 99: null });
});

const { targetFromArgv } = require('../src/main/openPath');

test('targetFromArgv finds the right-clicked folder or file', () => {
  const fsx = { exists: (p) => !p.endsWith('missing'), isDir: (p) => !p.endsWith('.txt') };
  const dir = targetFromArgv(['C:/Apps/Burrow.exe', 'C:/code/app'], fsx);
  assert.equal(dir.file, null);
  assert.match(dir.dir, /code.app$/);
  const file = targetFromArgv(['C:/Apps/Burrow.exe', 'C:/code/app/notes.txt'], fsx);
  assert.match(file.dir, /code.app$/);
  assert.match(file.file, /notes\.txt$/);
  assert.equal(targetFromArgv(['electron.exe', '.', '--enable-logging'], fsx), null);
  assert.equal(targetFromArgv(['Burrow.exe', 'C:/nope/missing'], fsx), null);
});

const files = require('../src/main/files');

test('editor file access never leaves the project folder', () => {
  const root = require('node:path').resolve('/projects/app');
  assert.ok(files.safeJoin(root, 'src/a.js').endsWith('a.js'));
  assert.throws(() => files.safeJoin(root, '../secret.txt'));
  assert.throws(() => files.safeJoin(root, 'C:/Windows/win.ini'));
});

test('pane/open adds beside the focus, focuses if already open, replaces when full', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'pane/open', paneId: 'edit:p1:README.md' });
  assert.deepEqual(s.pages[0].panes, ['s1', 'edit:p1:README.md']);
  assert.equal(s.pages[0].focus, 'edit:p1:README.md');
  s = reduce(s, { type: 'pane/focus', sessionId: 's1' });
  const again = reduce(s, { type: 'pane/open', paneId: 'edit:p1:README.md' });
  assert.deepEqual(again.pages[0].panes, ['s1', 'edit:p1:README.md']);
  assert.equal(again.pages[0].focus, 'edit:p1:README.md');
  for (const f of ['a', 'b', 'c', 'd']) s = reduce(s, { type: 'pane/open', paneId: `edit:p1:${f}.md` });
  s = reduce(s, { type: 'pane/open', paneId: 'edit:p1:e.md' });
  assert.equal(s.pages[0].panes.length, 6);
  s = reduce(s, { type: 'pane/open', paneId: 'edit:p1:c.md' });
  assert.equal(s.pages[0].panes.length, 6);
  assert.ok(s.pages[0].panes.includes('edit:p1:c.md'));
});

test('editor refuses files reached through a link that points outside the project', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'burrow-proj-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'burrow-out-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
  try {
    fs.symlinkSync(outside, path.join(root, 'link'), 'junction');
  } catch {
    t.skip('cannot create links here');
    return;
  }
  assert.throws(() => files.safeJoin(root, 'link/secret.txt'));
  assert.ok(files.safeJoin(root, 'new-file.md').endsWith('new-file.md'));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('dragging a session places it beside a pane and keeps its own page', () => {
  let s = addSession(withProject(), 's1');
  s = reduce(s, { type: 'session/create', projectId: 'p1', agent: 'claude', id: 's2', show: false });
  s = reduce(s, { type: 'pane/place', sessionId: 's2', target: 's1', side: 'left' });
  assert.deepEqual(s.pages[0].panes, ['s2', 's1']);
  assert.equal(s.pages[0].tree.dir, 'row');
  s = reduce(s, { type: 'pane/place', sessionId: 's2', target: 's1', side: 'bottom' });
  assert.deepEqual(s.pages[0].panes, ['s1', 's2']);
  assert.equal(s.pages[0].tree.dir, 'col');
  s = reduce(s, { type: 'page/add' });
  s = reduce(s, { type: 'pane/place', sessionId: 's2', target: null, side: 'center' });
  assert.deepEqual(s.pages[1].panes, ['s2']);
  s = reduce(s, { type: 'page/go', index: 0 });
  // closing the split pane leaves the session on its own page, and clicking it goes there
  s = reduce(s, { type: 'pane/close', sessionId: 's2' });
  assert.deepEqual(s.pages[0].panes, ['s1']);
  s = reduce(s, { type: 'session/show', id: 's2' });
  assert.equal(s.settings.page, 1);
  assert.deepEqual(s.pages[0].panes, ['s1']);
  assert.equal(reduce(s, { type: 'pane/place', sessionId: 'nope', target: null, side: 'left' }), s);
});

test('layouts can mix side-by-side and stacked panes', () => {
  let s = addSession(withProject(), 's1');
  for (const id of ['s2', 's3', 's4']) s = reduce(s, { type: 'session/create', projectId: 'p1', agent: 'shell', id, show: false });
  // s1 | s2, then stack s3 under s2: one tall pane on the left, two on the right
  s = reduce(s, { type: 'pane/place', sessionId: 's2', target: 's1', side: 'right' });
  s = reduce(s, { type: 'pane/place', sessionId: 's3', target: 's2', side: 'bottom' });
  assert.deepEqual(s.pages[0].tree, { dir: 'row', kids: ['s1', { dir: 'col', kids: ['s2', 's3'], sizes: [1, 1] }], sizes: [1, 1] });
  // resizing the inner stack only touches that split
  s = reduce(s, { type: 'pane/sizes', path: [1], sizes: [2, 1] });
  assert.deepEqual(s.pages[0].tree.kids[1].sizes, [2, 1]);
  // a third pane in the same direction shares the target's space
  s = reduce(s, { type: 'pane/place', sessionId: 's4', target: 's3', side: 'bottom' });
  assert.deepEqual(s.pages[0].tree.kids[1].kids, ['s2', 's3', 's4']);
  assert.deepEqual(s.pages[0].tree.kids[1].sizes, [2, 0.5, 0.5]);
  // moving a pane already on the page re-homes it; closing collapses empty splits
  s = reduce(s, { type: 'pane/place', sessionId: 's1', target: 's4', side: 'right' });
  assert.deepEqual(s.pages[0].panes, ['s2', 's3', 's4', 's1']);
  assert.deepEqual(s.pages[0].tree.kids[2], { dir: 'row', kids: ['s4', 's1'], sizes: [1, 1] });
  for (const id of ['s2', 's3', 's1']) s = reduce(s, { type: 'pane/close', sessionId: id });
  assert.equal(s.pages[0].tree, 's4');
});

test('old flat pages are migrated to split trees', () => {
  const s = normalize({ pages: [{ id: 'a', dir: 'col', panes: ['x', 'y'], sizes: [3, 1], focus: 'y' }, { id: 'b', panes: [] }] });
  assert.deepEqual(s.pages[0].tree, { dir: 'col', kids: ['x', 'y'], sizes: [3, 1] });
  assert.deepEqual(s.pages[0].panes, ['x', 'y']);
  assert.equal(s.pages[1].tree, null);
  // a damaged tree is cleaned up rather than crashing
  const bad = normalize({ pages: [{ id: 'c', tree: { dir: 'row', kids: ['x', 'x', 42, { dir: 'nope' }] } }] });
  assert.equal(bad.pages[0].tree, 'x');
});
