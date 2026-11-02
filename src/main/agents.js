'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Each agent: how to launch it, how to resume it, and how it looks in the sidebar.
const AGENTS = Object.freeze([
  { id: 'claude', name: 'Claude Code', bin: 'claude', color: '#e8825a', resumeArgs: ['--continue'], mcp: 'claude' },
  { id: 'codex', name: 'Codex', bin: 'codex', color: '#9aa4ff', resumeArgs: ['resume', '--last'], mcp: null },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', color: '#6fb3ff', resumeArgs: [], mcp: null },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', color: '#c9c9c9', resumeArgs: ['--continue'], mcp: null },
  { id: 'cursor', name: 'Cursor Agent', bin: 'cursor-agent', color: '#d7d7d7', resumeArgs: ['resume'], mcp: null },
  { id: 'kimi', name: 'Kimi Code', bin: 'kimi', color: '#7fd1b9', resumeArgs: ['--continue'], mcp: null },
  { id: 'shell', name: 'Terminal', bin: null, color: '#8b93a1', resumeArgs: [], mcp: null },
]);

const findAgent = (id) => AGENTS.find((a) => a.id === id) || AGENTS[AGENTS.length - 1];

// ---------- PATH ----------
// A running app keeps the PATH it started with, so tools installed afterwards are
// invisible. We re-read the user + machine PATH from the registry instead.

const HOME = os.homedir();
const EXTRA_DIRS = [
  path.join(HOME, 'AppData', 'Roaming', 'npm'),
  path.join(HOME, '.local', 'bin'),
  path.join(HOME, '.bun', 'bin'),
  path.join(HOME, '.opencode', 'bin'),
  path.join(HOME, 'scoop', 'shims'),
];

function regPath(key) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/v', 'Path'], { windowsHide: true, timeout: 3000 }, (err, stdout) => {
      if (err) return resolve('');
      const m = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
      resolve(m ? m[1].trim() : '');
    });
  });
}

const expandVars = (s) => s.replace(/%([^%]+)%/g, (all, name) => process.env[name] ?? all);

let pathCache = { at: 0, value: process.env.PATH || '' };
/** Current PATH: registry user + machine PATH, the app's own PATH and common install dirs. Cached 3s. */
async function freshPath() {
  if (Date.now() - pathCache.at < 3000) return pathCache.value;
  const [machine, user] = await Promise.all([
    regPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),
    regPath('HKCU\\Environment'),
  ]);
  const seen = new Set();
  const dirs = [machine, user, process.env.PATH || '', EXTRA_DIRS.join(';')]
    .flatMap((p) => expandVars(p).split(';'))
    .map((d) => d.trim())
    .filter((d) => d && !seen.has(d.toLowerCase()) && seen.add(d.toLowerCase()));
  pathCache = { at: Date.now(), value: dirs.join(';') };
  return pathCache.value;
}

const EXTS = ['.exe', '.cmd', '.bat', '.ps1', ''];

/** Find an executable by scanning PATH dirs directly (no child process per tool). */
function findOnPath(bin, pathValue) {
  for (const dir of pathValue.split(';')) {
    for (const ext of EXTS) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

async function detectInstalled() {
  const p = await freshPath();
  return AGENTS.map((a) => {
    const location = a.bin ? findOnPath(a.bin, p) : 'built-in';
    return { ...a, installed: Boolean(location), location };
  });
}

let shellCache = null;
async function resolveShell() {
  if (shellCache) return shellCache;
  shellCache = findOnPath('pwsh', await freshPath()) ? 'pwsh.exe' : 'powershell.exe';
  return shellCache;
}

// Quote one argument for a PowerShell command line.
const psQuote = (s) => (/^[\w@%+=:,./\\-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "''")}'`);

/** Build the shell + args that start an agent inside an interactive shell. */
function buildLaunch(shell, agent, { resume = false, mcpConfigPath = null, extraArgs = [] } = {}) {
  if (!agent.bin) return { file: shell, args: ['-NoLogo'] };
  const args = [...(resume ? agent.resumeArgs : []), ...extraArgs];
  if (agent.mcp === 'claude' && mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
  const cmd = [agent.bin, ...args].map(psQuote).join(' ');
  return { file: shell, args: ['-NoLogo', '-NoExit', '-Command', `& ${cmd}`] };
}

module.exports = { AGENTS, findAgent, detectInstalled, resolveShell, buildLaunch, psQuote, freshPath, findOnPath };
