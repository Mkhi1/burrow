'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { reduce, normalize } = require('./reducer');
const { PtyManager } = require('./ptyManager');
const { findAgent, detectInstalled, resolveShell, buildLaunch, freshPath } = require('./agents');
const { startBridge } = require('./bridge');
const { UsageService } = require('./usage');

app.setAppUserModelId('app.burrow.terminal');
if (process.env.BURROW_USER_DATA) app.setPath('userData', process.env.BURROW_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

const STATE_FILE = () => path.join(app.getPath('userData'), 'state.json');
const MCP_DIR = () => path.join(app.getPath('userData'), 'mcp');
const MCP_SERVER = path.join(__dirname, '..', 'mcp', 'server.js');

let win = null;
let state = null;
let agents = [];
let bridge = null;
let saveTimer = null;
const ptys = new PtyManager();
let usage = null;

// ---------- state ----------

function loadState() {
  try {
    return normalize(JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')));
  } catch {
    return normalize(null);
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
      fs.writeFileSync(STATE_FILE() + '.tmp', JSON.stringify(state, null, 2));
      fs.renameSync(STATE_FILE() + '.tmp', STATE_FILE());
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }, 250);
}

const send = (channel, ...args) => win && !win.isDestroyed() && win.webContents.send(channel, ...args);

function dispatch(action) {
  const next = reduce(state, action);
  if (next === state) return state;
  state = next;
  persist();
  send('state', state);
  if (action.type === 'settings/update' && 'material' in action.patch) applyMaterial();
  return state;
}

const statuses = () => Object.fromEntries(state.sessions.map((s) => [s.id, ptys.statusOf(s.id)]));
const findSession = (id) => state.sessions.find((s) => s.id === id);
const findProject = (id) => state.projects.find((p) => p.id === id);

// ---------- sessions ----------

function writeMcpConfig(sessionId) {
  if (!bridge || !state.settings.mcp) return null;
  fs.mkdirSync(MCP_DIR(), { recursive: true });
  const file = path.join(MCP_DIR(), `${sessionId}.json`);
  const config = {
    mcpServers: {
      burrow: {
        command: process.execPath,
        args: [MCP_SERVER],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          BURROW_PORT: String(bridge.port),
          BURROW_TOKEN: bridge.token,
          BURROW_SESSION_ID: sessionId,
        },
      },
    },
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

const promptArgs = (agentId, prompt) => {
  if (!prompt) return [];
  if (agentId === 'claude' || agentId === 'codex') return [prompt];
  if (agentId === 'gemini') return ['-i', prompt];
  return null; // agent has no prompt flag; type it in after start-up instead
};

async function startSession(id, { cols, rows, prompt } = {}) {
  const session = findSession(id);
  if (!session || ptys.has(id)) return;
  const agent = findAgent(session.agent);
  const project = findProject(session.projectId);
  const extra = promptArgs(agent.id, prompt);
  const launch = buildLaunch(await resolveShell(), agent, {
    resume: Boolean(session.started) && !prompt,
    mcpConfigPath: writeMcpConfig(id),
    extraArgs: extra || [],
  });
  // Demo mode (for screenshots): no profile, neutral prompt, so no personal info shows.
  if (process.env.BURROW_DEMO && agent.id === 'shell') {
    launch.args = ['-NoLogo', '-NoProfile', '-NoExit', '-Command', 'function prompt { "PS ~\\burrow> " }'];
  }
  const env = { PATH: await freshPath() };
  if (bridge) Object.assign(env, { BURROW_SESSION_ID: id, BURROW_PORT: String(bridge.port), BURROW_TOKEN: bridge.token });
  ptys.spawn(id, { ...launch, cwd: project?.path, cols, rows, env });
  if (prompt && extra === null) setTimeout(() => ptys.sendText(id, prompt), 5000);
  dispatch({ type: 'session/started', id });
  send('status', id, ptys.statusOf(id));
}

function createSession({ projectId, agent, title, prompt, show = true, cols, rows }) {
  if (!findProject(projectId)) throw new Error('Unknown project');
  const before = new Set(state.sessions.map((s) => s.id));
  dispatch({ type: 'session/create', projectId, agent: agent || state.settings.defaultAgent, title, show });
  const created = state.sessions.find((s) => !before.has(s.id));
  startSession(created.id, { cols, rows, prompt });
  return created;
}

// ---------- notifications ----------

function isVisible(id) {
  const page = state.pages[state.settings.page];
  return Boolean(win?.isFocused() && page?.panes.includes(id));
}

// Agents pause between bursts of output, so "busy → idle" flickers constantly.
// We only call a run finished after it worked a while and then stayed quiet.
const MIN_RUN_MS = 8000; // ignore short blips (typing echo, prompt redraws)
const SETTLE_MS = 4000; // must stay idle/attention this long before we notify
const COOLDOWN_MS = 30000; // at most one notification per session per 30s
const runs = new Map(); // id -> { busySince, timer, lastNotified }

function trackForNotify(id, status) {
  const run = runs.get(id) || { busySince: 0, timer: null, lastNotified: 0 };
  runs.set(id, run);
  clearTimeout(run.timer);
  run.timer = null;
  if (status === 'busy') {
    if (!run.busySince) run.busySince = Date.now();
    return;
  }
  if (status === 'exited' || status === 'dormant') {
    runs.delete(id);
    return;
  }
  const worked = run.busySince ? Date.now() - run.busySince : 0;
  if (status === 'idle' && worked < MIN_RUN_MS) {
    run.busySince = 0;
    return;
  }
  run.timer = setTimeout(() => {
    run.timer = null;
    run.busySince = 0;
    // Still in the same state after settling?
    if (ptys.statusOf(id) !== status) return;
    if (Date.now() - run.lastNotified < COOLDOWN_MS) return;
    run.lastNotified = Date.now();
    notify(id, status);
  }, SETTLE_MS);
}

function notify(id, status) {
  const session = findSession(id);
  if (!session || isVisible(id)) return;
  send('unread', id, status === 'attention' ? 'attention' : 'done');
  // Plain terminals only get the sidebar dot, never a popup.
  if (!state.settings.notifications || session.agent === 'shell' || !Notification.isSupported()) return;
  const n = new Notification({
    title: session.title,
    body: status === 'attention' ? `${findAgent(session.agent).name} needs your input` : `${findAgent(session.agent).name} finished`,
    silent: false,
  });
  n.on('click', () => {
    win?.show();
    win?.focus();
    dispatch({ type: 'session/show', id });
  });
  n.show();
  if (!win?.isFocused()) win?.flashFrame(true);
}

ptys.on('data', (id, chunk) => send('pty:data', id, chunk));
ptys.on('title', (id, title) => dispatch({ type: 'session/autotitle', id, title }));
ptys.on('status', (id, status) => {
  send('status', id, status);
  trackForNotify(id, status);
});
ptys.on('exit', (id) => send('status', id, 'exited'));

// ---------- bridge for MCP ----------

const bridgeHandlers = {
  list: (from) => ({
    sessions: state.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      agent: s.agent,
      project: findProject(s.projectId)?.name,
      projectPath: findProject(s.projectId)?.path,
      status: ptys.statusOf(s.id),
      self: s.id === from,
    })),
  }),
  read: (id, lines) => {
    if (!findSession(id)) throw new Error(`No session ${id}`);
    return { id, status: ptys.statusOf(id), output: ptys.readText(id, lines) };
  },
  send: (from, to, text, submit) => {
    if (!findSession(to)) throw new Error(`No session ${to}`);
    if (!ptys.has(to)) throw new Error(`Session ${to} is not running`);
    const sender = findSession(from);
    ptys.sendText(to, text, submit);
    send('toast', `${sender?.title || 'An agent'} → ${findSession(to).title}`);
    return { ok: true };
  },
  create: async (from, { agent, prompt, title, projectPath }) => {
    let projectId = findSession(from)?.projectId;
    if (projectPath) {
      dispatch({ type: 'project/add', path: path.resolve(projectPath) });
      projectId = state.projects.find((p) => p.path.toLowerCase() === path.resolve(projectPath).toLowerCase()).id;
    }
    if (!projectId) throw new Error('projectPath is required');
    const s = createSession({ projectId, agent, title, prompt, show: false, cols: 120, rows: 32 });
    return { id: s.id, title: s.title };
  },
};

// ---------- agents ----------

let lastAgentCheck = 0;
async function refreshAgents() {
  lastAgentCheck = Date.now();
  const next = await detectInstalled();
  const changed = JSON.stringify(next.map((a) => a.installed)) !== JSON.stringify(agents.map((a) => a.installed));
  agents = next;
  if (changed) send('agents', agents);
  return agents;
}

// ---------- demo (README screenshots) ----------
// Types into Burrow's own terminals from inside the app; never touches the real keyboard.
function runDemo() {
  if (!process.env.BURROW_DEMO) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.env.BURROW_DEMO_VIEW === 'usage') {
    setTimeout(() => send('demo', 'usage'), 1500);
    return;
  }
  setTimeout(() => {
    for (const s of state.sessions) {
      if (!ptys.has(s.id)) continue;
      if (s.agent === 'shell') ptys.write(s.id, 'npm test\r');
      if (s.agent === 'claude') ptys.write(s.id, 'add a dark-mode toggle to the settings page and update the tokens');
    }
  }, 9000);
}

// ---------- window ----------

function applyMaterial() {
  if (!win || process.platform !== 'win32') return;
  try {
    win.setBackgroundMaterial(state.settings.material === 'none' ? 'none' : state.settings.material);
  } catch {
    /* unsupported on this Windows build */
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    title: 'Burrow',
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    backgroundMaterial: state.settings.material === 'none' ? 'none' : state.settings.material,
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    runDemo();
  });
  win.on('focus', () => {
    win.flashFrame(false);
    if (Date.now() - lastAgentCheck > 5000) refreshAgents();
  });
  win.on('maximize', () => send('window:maximized', true));
  win.on('unmaximize', () => send('window:maximized', false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('state:get', () => ({ state, agents, statuses: statuses() }));
  ipcMain.handle('dispatch', (_e, action) => dispatch(action));

  ipcMain.handle('session:new', (_e, opts) => createSession(opts));
  ipcMain.handle('session:ensure', async (_e, id, cols, rows) => {
    await startSession(id, { cols, rows });
    return ptys.buffer(id);
  });
  ipcMain.handle('session:restart', async (_e, id, cols, rows) => {
    ptys.kill(id);
    await startSession(id, { cols, rows });
    return true;
  });
  ipcMain.handle('session:stop', (_e, id) => {
    ptys.kill(id);
    send('status', id, 'dormant');
  });
  ipcMain.handle('session:remove', (_e, id) => {
    ptys.kill(id);
    dispatch({ type: 'session/remove', id });
  });
  ipcMain.handle('project:remove', (_e, id) => {
    state.sessions.filter((s) => s.projectId === id).forEach((s) => ptys.kill(s.id));
    dispatch({ type: 'project/remove', id });
  });
  ipcMain.handle('project:pick', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Add a project folder' });
    if (res.canceled || !res.filePaths[0]) return null;
    dispatch({ type: 'project/add', path: res.filePaths[0] });
    return state.projects.find((p) => p.path.toLowerCase() === res.filePaths[0].toLowerCase());
  });
  ipcMain.handle('project:open', (_e, id) => {
    const p = findProject(id);
    if (p) shell.openPath(p.path);
  });
  ipcMain.handle('usage:get', (_e, opts) => {
    const safe = { range: ['today', '7d', '30d', 'all'].includes(opts?.range) ? opts.range : '7d', agent: ['all', 'claude', 'codex'].includes(opts?.agent) ? opts.agent : 'all' };
    return { ...usage.summary(safe), scanning: Boolean(usage.scanning) };
  });
  ipcMain.handle('usage:scan', () => {
    usage
      .scan((done, total) => send('usage:progress', done, total))
      .then(() => send('usage:updated'))
      .catch((err) => send('toast', `Usage scan failed: ${err.message}`));
    return true;
  });
  ipcMain.handle('agents:refresh', () => refreshAgents());

  ipcMain.on('pty:write', (_e, id, data) => ptys.write(id, data));
  ipcMain.on('pty:resize', (_e, id, cols, rows) => ptys.resize(id, cols, rows));

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
  ipcMain.on('window:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
  ipcMain.on('shell:external', (_e, url) => /^https?:/.test(url) && shell.openExternal(url));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  state = loadState();
  agents = await detectInstalled();
  usage = new UsageService(path.join(app.getPath('userData'), 'usage-cache.json'));
  bridge = await startBridge(bridgeHandlers).catch(() => null);
  registerIpc();
  createWindow();
});

app.on('before-quit', () => {
  ptys.killAll();
  bridge?.close();
  clearTimeout(saveTimer);
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2));
  } catch {
    /* best effort */
  }
});
app.on('window-all-closed', () => app.quit());
