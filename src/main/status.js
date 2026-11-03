'use strict';

// Pure helpers that turn raw terminal output into session state.

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b[@-Z\\-_]|[\x00-\x08\x0b-\x1f\x7f]/g;

const stripAnsi = (s) => s.replace(ANSI_RE, '');

const OSC_TITLE_RE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

/** Return the last OSC window title in a chunk, cleaned, or null. */
function extractTitle(chunk) {
  let last = null;
  for (const m of chunk.matchAll(OSC_TITLE_RE)) last = m[1];
  if (last == null) return null;
  const cleaned = last.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (!cleaned) return null;
  // Ignore shell titles that are just a path or an executable name.
  if (/^[a-z]:\\|\.exe$|^(administrator: )?(windows )?powershell|^pwsh/i.test(cleaned)) return null;
  if (/^(claude( code)?|codex|gemini|opencode)$/i.test(cleaned)) return null;
  return cleaned.slice(0, 120);
}

const ATTENTION_PATTERNS = [
  /do you want to (proceed|make this edit|create|run|allow)/i,
  /\(y\/n\)|\[y\/n\]|\[Y\/n\]/,
  /allow (once|always)|approve this/i,
  /❯\s*1\.\s*Yes/,
  /waiting for (your )?(approval|confirmation)/i,
];

// Agents print one of these on screen only while they are working (Claude Code, Codex, Gemini, OpenCode).
const BUSY_PATTERNS = [/esc to (interrupt|cancel)/i, /esc interrupt/i, /ctrl\+c to (cancel|interrupt)/i];

// A shell prompt waiting at the cursor: PowerShell, cmd, bash/zsh, fish/starship.
const PROMPT_RE = /^(PS [^>]*>|[A-Za-z]:\\[^>]*>)|[$#❯›»]\s*$|^>{1,3}\s*$/;

const needsAttention = (text) => ATTENTION_PATTERNS.some((re) => re.test(text));
const looksBusy = (text) => BUSY_PATTERNS.some((re) => re.test(text));
const atPrompt = (line) => PROMPT_RE.test(line.trimEnd());

const BUSY_HOLD_MS = 1200; // agents redraw; keep "working" briefly after the marker blinks off

/**
 * Decide status from what is on screen right now, plus output timing.
 *  screen: visible text of the terminal · cursorLine: the line the cursor is on
 *  agent: 'shell' or an agent id · marks: per-terminal memory (mutated: busySeen, sawMarker)
 */
function computeStatus({ now, lastOutput, lastInput, lastEnter = 0, screen = '', cursorLine = '', fullscreen = false, agent = 'shell', exited, marks = {} }) {
  if (exited) return 'exited';
  const sinceOut = now - lastOutput;
  if (sinceOut > 700 && needsAttention(screen)) return 'attention';

  if (looksBusy(screen)) {
    marks.busySeen = now;
    marks.sawMarker = true;
  }
  if (agent !== 'shell' && marks.sawMarker) {
    // The agent shows a working line while busy; when it disappears, it's done.
    return now - (marks.busySeen || 0) < BUSY_HOLD_MS ? 'busy' : 'idle';
  }

  // Plain shell: a command runs until a fresh prompt comes back (promptSeen is set by the
  // caller only for a prompt on a new line, so the line the command was typed on doesn't count).
  if (agent === 'shell' && !fullscreen) {
    if (lastEnter > (marks.promptSeen || 0)) return 'busy';
    if (atPrompt(cursorLine)) return 'idle';
  }
  // Full-screen apps, or an agent we can't read yet: go by output timing.
  const echoOnly = lastOutput - lastInput < 250 && lastOutput >= lastInput;
  if (sinceOut < 1500 && !echoOnly) return 'busy';
  return 'idle';
}

module.exports = { stripAnsi, extractTitle, computeStatus, needsAttention, atPrompt, looksBusy };
