'use strict';

// Parses agent transcript files into compact per-day token buckets.
// A file summary: { agent, cwd, session, title, first, last,
//   buckets: { "YYYY-MM-DD|model": [in, cacheWrite, cacheRead, out, msgs] },
//   hours: { "YYYY-MM-DD|H": tokens } }   (local hour 0-23, for the when-you-work heatmap)

const fs = require('node:fs');
const readline = require('node:readline');

const dayKey = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

function emptySummary(agent) {
  return { agent, cwd: null, session: null, title: null, first: null, last: null, buckets: {}, hours: {} };
}

function add(summary, ts, model, inp, cw, cr, out) {
  const day = dayKey(ts);
  if (!day || inp + cw + cr + out === 0) return;
  const key = `${day}|${model || 'unknown'}`;
  const b = summary.buckets[key] || (summary.buckets[key] = [0, 0, 0, 0, 0]);
  b[0] += inp;
  b[1] += cw;
  b[2] += cr;
  b[3] += out;
  b[4] += 1;
  const hour = `${day}|${new Date(ts).getHours()}`;
  summary.hours[hour] = (summary.hours[hour] || 0) + inp + cw + cr + out;
  if (!summary.first || ts < summary.first) summary.first = ts;
  if (!summary.last || ts > summary.last) summary.last = ts;
}

function firstText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.find((c) => c?.type === 'text')?.text || null;
  return null;
}

const cleanTitle = (t) => {
  const s = String(t).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 80) : null;
};

/** Claude Code: assistant lines carry message.usage; one message can span several lines. */
function claudeLine(summary, line, seen) {
  const maybeTitle = !summary.title && line.includes('"type":"user"');
  const maybeUsage = line.includes('"usage"') && line.includes('"assistant"');
  if (!maybeTitle && !maybeUsage) return;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return;
  }
  if (!summary.cwd && j.cwd) summary.cwd = j.cwd;
  if (!summary.session && j.sessionId) summary.session = j.sessionId;
  if (j.type === 'user') {
    const text = firstText(j.message?.content);
    if (!summary.title && text && !text.startsWith('<') && !j.isMeta) summary.title = cleanTitle(text);
    return;
  }
  const msg = j.message;
  const u = msg?.usage;
  if (!u) return;
  const id = `${msg.id || ''}|${j.requestId || ''}`;
  if (seen.has(id)) return;
  seen.add(id);
  add(summary, j.timestamp, msg.model, num(u.input_tokens), num(u.cache_creation_input_tokens), num(u.cache_read_input_tokens), num(u.output_tokens));
}

/** Codex: token_count events carry running totals; we add the difference each time. */
function codexLine(summary, line, state) {
  if (!line.includes('"session_meta"') && !line.includes('"turn_context"') && !line.includes('"token_count"') && !(state.needTitle && line.includes('"user_message"'))) return;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return;
  }
  const p = j.payload || {};
  if (j.type === 'session_meta') {
    summary.cwd = p.cwd || summary.cwd;
    summary.session = p.id || p.session_id || summary.session;
  } else if (j.type === 'turn_context') {
    state.model = p.model || state.model;
  } else if (p.type === 'user_message' && state.needTitle) {
    const t = cleanTitle(p.message || '');
    if (t) {
      summary.title = t;
      state.needTitle = false;
    }
  } else if (p.type === 'token_count' && p.info?.total_token_usage) {
    const t = p.info.total_token_usage;
    const prev = state.prev || {};
    const d = (k) => Math.max(0, num(t[k]) - num(prev[k]));
    state.prev = t;
    const cached = d('cached_input_tokens');
    let inp = Math.max(0, d('input_tokens') - cached);
    const out = d('output_tokens');
    const cw = d('cache_write_input_tokens');
    // Some builds only report total_tokens.
    if (inp + cached + out + cw === 0) inp = d('total_tokens');
    add(summary, j.timestamp, state.model || 'codex', inp, cw, cached, out);
  }
}

async function parseFile(file, agent) {
  const summary = emptySummary(agent);
  const seen = new Set();
  const codexState = { model: null, prev: null, needTitle: true };
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (agent === 'claude') claudeLine(summary, line, seen);
    else codexLine(summary, line, codexState);
  }
  return summary;
}

module.exports = { parseFile, dayKey };
