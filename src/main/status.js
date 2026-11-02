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

const BUSY_PATTERNS = [/esc to interrupt/i, /ctrl\+c to (cancel|interrupt)/i];

const needsAttention = (tail) => ATTENTION_PATTERNS.some((re) => re.test(tail));
const looksBusy = (tail) => BUSY_PATTERNS.some((re) => re.test(tail));

/**
 * Decide status from timing + the visible tail of output.
 * now/lastOutput/lastInput are ms timestamps.
 */
function computeStatus({ now, lastOutput, lastInput, tail, exited }) {
  if (exited) return 'exited';
  const sinceOut = now - lastOutput;
  const echoOnly = lastOutput - lastInput < 250 && lastOutput >= lastInput;
  const recent = tail.slice(-1500);
  if (sinceOut > 700 && needsAttention(recent)) return 'attention';
  if (sinceOut < 1500 && !echoOnly) return 'busy';
  if (sinceOut < 4000 && looksBusy(recent)) return 'busy';
  return 'idle';
}

module.exports = { stripAnsi, extractTitle, computeStatus, needsAttention };
