'use strict';

// Figures out which agent is really running inside a terminal by looking at
// the processes under its shell (e.g. you opened "Terminal" and typed `claude`).

const { execFile } = require('node:child_process');

// Ordered: first match wins. Matched against "name commandline", lowercased.
const SIGNATURES = [
  { agent: 'claude', re: /(^|[\\/\s])claude(\.exe)?(\s|$)|@anthropic-ai[\\/]claude-code|claude-code[\\/]cli/ },
  { agent: 'codex', re: /(^|[\\/\s])codex(\.exe)?(\s|$)|@openai[\\/]codex/ },
  { agent: 'opencode', re: /(^|[\\/\s])opencode(\.exe)?(\s|$)|opencode-ai/ },
  { agent: 'gemini', re: /(^|[\\/\s])gemini(\.exe)?(\s|$)|@google[\\/]gemini-cli/ },
  { agent: 'cursor', re: /cursor-agent/ },
  { agent: 'kimi', re: /(^|[\\/\s])kimi(\.exe)?(\s|$)|kimi-cli/ },
];

/** Which agent does one process look like? null if none. */
function matchProcess(name, commandLine) {
  const text = `${name || ''} ${commandLine || ''}`.toLowerCase();
  return SIGNATURES.find((s) => s.re.test(text))?.agent || null;
}

/**
 * Given a flat process list and root pids, return { rootPid: agentId|null }.
 * The deepest-first match under each root wins, so a node.exe running Claude counts.
 */
function agentsUnder(processes, rootPids) {
  const children = new Map();
  for (const p of processes) {
    if (!children.has(p.ppid)) children.set(p.ppid, []);
    children.get(p.ppid).push(p);
  }
  const result = {};
  for (const root of rootPids) {
    let found = null;
    const stack = [...(children.get(root) || [])];
    const seen = new Set();
    while (stack.length && !found) {
      const p = stack.pop();
      if (seen.has(p.pid)) continue;
      seen.add(p.pid);
      found = matchProcess(p.name, p.cmd);
      stack.push(...(children.get(p.pid) || []));
    }
    result[root] = found;
  }
  return result;
}

const PS_QUERY =
  "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine | " +
  "ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)\" }";

/** One snapshot of all processes (pid, ppid, name, cmd). ~0.3s, run sparingly. */
function listProcesses() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_QUERY],
      { windowsHide: true, timeout: 8000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve(
          stdout.split(/\r?\n/).filter(Boolean).map((line) => {
            const [pid, ppid, name, ...cmd] = line.split('\t');
            return { pid: Number(pid), ppid: Number(ppid), name, cmd: cmd.join('\t') };
          })
        );
      }
    );
  });
}

module.exports = { matchProcess, agentsUnder, listProcesses };
