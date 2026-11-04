'use strict';

// Pure aggregation of parsed file summaries into what the Usage page shows.

const path = require('node:path');
const { dayKey } = require('./usageParse');

const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30, all: Infinity };
const CHART_DAYS = { today: 7, '7d': 7, '30d': 30, all: 30 };

function lastDays(now, n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  return days;
}

const zero = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, messages: 0 });
const total = (t) => t.input + t.cacheWrite + t.cacheRead + t.output;
const weekdayOf = (day) => (new Date(`${day}T00:00`).getDay() + 6) % 7; // Monday = 0

function addInto(t, b) {
  t.input += b[0];
  t.cacheWrite += b[1];
  t.cacheRead += b[2];
  t.output += b[3];
  t.messages += b[4];
}

const top = (map, n, extra = () => ({})) =>
  [...map.entries()]
    .map(([key, t]) => ({ key, ...t, total: total(t), ...extra(key, t) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);

/**
 * summaries: array of parsed file summaries.
 * opts: { range: 'today'|'7d'|'30d'|'all', agent: 'all'|'claude'|'codex', now: Date }
 */
function aggregate(summaries, { range = '7d', agent = 'all', now = new Date() } = {}) {
  const span = RANGE_DAYS[range] ?? 7;
  const inRange = new Set(Number.isFinite(span) ? lastDays(now, span) : []);
  const chartDays = lastDays(now, CHART_DAYS[range] ?? 7);
  const chartSet = new Set(chartDays);
  const keep = (day) => !Number.isFinite(span) || inRange.has(day);

  const totals = zero();
  const perDay = new Map(chartDays.map((d) => [d, zero()]));
  const trendDays = lastDays(now, 30);
  const allDays = new Map(); // day -> total, every day (for the trend, streak and previous period)
  const rangeDays = new Map(); // day -> total, days inside the range
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0)); // weekday x hour
  const hours = new Array(24).fill(0);
  const projects = new Map();
  const models = new Map();
  const sessions = new Map();
  const agents = new Map();

  for (const s of summaries) {
    if (agent !== 'all' && s.agent !== agent) continue;
    const projKey = (s.cwd || 'unknown').toLowerCase();
    const sessKey = `${s.agent}:${s.session || s.title || s.first}`;
    for (const [key, b] of Object.entries(s.buckets)) {
      const [day, model] = key.split('|');
      const sum = b[0] + b[1] + b[2] + b[3];
      if (chartSet.has(day)) addInto(perDay.get(day), b);
      allDays.set(day, (allDays.get(day) || 0) + sum);
      if (!keep(day)) continue;
      rangeDays.set(day, (rangeDays.get(day) || 0) + sum);
      addInto(totals, b);
      for (const [map, k] of [[projects, projKey], [models, model], [sessions, sessKey], [agents, s.agent]]) {
        if (!map.has(k)) map.set(k, zero());
        addInto(map.get(k), b);
      }
      const meta = sessions.get(sessKey);
      meta.title = meta.title || s.title;
      meta.cwd = meta.cwd || s.cwd;
      meta.agent = s.agent;
      if (!meta.last || s.last > meta.last) meta.last = s.last;
      const proj = projects.get(projKey);
      proj.cwd = proj.cwd || s.cwd;
    }
    for (const [key, v] of Object.entries(s.hours || {})) {
      const [day, hr] = key.split('|');
      if (!keep(day)) continue;
      heat[weekdayOf(day)][Number(hr)] += v;
      hours[Number(hr)] += v;
    }
  }

  // the same length of time just before this range, to compare against
  let prevTotal = null;
  if (Number.isFinite(span)) {
    const prev = lastDays(new Date(now.getFullYear(), now.getMonth(), now.getDate() - span), span);
    prevTotal = prev.reduce((a, d) => a + (allDays.get(d) || 0), 0);
  }
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    if (allDays.get(d)) streak++;
    else if (i > 0) break; // today may still be empty
    if (i > 3660) break;
  }
  const active = [...rangeDays.entries()].filter(([, v]) => v > 0);
  const busiest = active.reduce((m, [day, v]) => (!m || v > m.total ? { day, total: v } : m), null);
  const peakHour = hours.reduce((m, v, i) => (v > hours[m] ? i : m), 0);

  const prompt = totals.input + totals.cacheWrite + totals.cacheRead;
  return {
    range,
    agent,
    totals: { ...totals, total: total(totals), sessions: sessions.size },
    cacheHit: prompt ? totals.cacheRead / prompt : 0,
    days: chartDays.map((day) => { const t = perDay.get(day); return { day, ...t, total: total(t) }; }),
    trend: trendDays.map((day) => ({ day, total: allDays.get(day) || 0 })),
    prevTotal,
    heat,
    hours,
    stats: {
      activeDays: active.length,
      busiest,
      streak,
      peakHour: hours[peakHour] ? peakHour : null,
      avgPerDay: active.length ? total(totals) / active.length : 0,
      perReply: totals.messages ? total(totals) / totals.messages : 0,
    },
    agents: top(agents, 10),
    projects: top(projects, 8, (_k, t) => ({ name: t.cwd ? path.win32.basename(t.cwd) || t.cwd : 'unknown', cwd: t.cwd })),
    models: top(models, 6),
    sessions: top(sessions, 8, (_k, t) => ({
      title: t.title || 'Untitled session',
      project: t.cwd ? path.win32.basename(t.cwd) : '',
      agent: t.agent,
      last: t.last,
    })),
  };
}

module.exports = { aggregate, lastDays };
