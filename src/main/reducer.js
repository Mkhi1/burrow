'use strict';

// Pure, immutable state transitions. Everything persistent goes through here.

const crypto = require('node:crypto');
const path = require('node:path');

const newId = () => crypto.randomUUID().slice(0, 8);
const MAX_PANES = 4;

const DEFAULT_SETTINGS = Object.freeze({
  accent: '#f2f2f2',
  fontSize: 13,
  fontFamily: 'Cascadia Mono, Consolas, monospace',
  material: 'acrylic',
  tint: 0.55,
  defaultAgent: 'claude',
  notifications: true,
  mcp: true,
  sidebarWidth: 272,
  sidebarVisible: true,
  page: 0,
  scene: 'none',
  sceneStrength: 1,
  glassCards: true,
  motion: 'on',
});

const initialState = () => ({
  settings: { ...DEFAULT_SETTINGS },
  projects: [],
  sessions: [],
  pages: [{ id: newId(), dir: 'row', panes: [], focus: null }],
});

const migrateSettings = (s) => (s.accent === '#e8825a' ? { ...s, accent: DEFAULT_SETTINGS.accent } : s);

function normalize(raw) {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const pages = Array.isArray(raw.pages) && raw.pages.length ? raw.pages : base.pages;
  return {
    settings: migrateSettings({ ...DEFAULT_SETTINGS, ...(raw.settings || {}) }),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    pages,
  };
}

const mapPage = (state, index, fn) => ({
  ...state,
  pages: state.pages.map((p, i) => (i === index ? fn(p) : p)),
});

const currentIndex = (state) => Math.min(Math.max(state.settings.page, 0), state.pages.length - 1);

/** Put a session in the focused pane of the current page (or the first pane). */
function showSession(state, sessionId) {
  // Prefer the page in view; a session can be on several pages after a drag.
  const here = state.pages[currentIndex(state)]?.panes.includes(sessionId);
  const pageIdx = here ? currentIndex(state) : state.pages.findIndex((p) => p.panes.includes(sessionId));
  if (pageIdx >= 0) {
    const withPage = { ...state, settings: { ...state.settings, page: pageIdx } };
    return mapPage(withPage, pageIdx, (p) => ({ ...p, focus: sessionId }));
  }
  return mapPage(state, currentIndex(state), (p) => {
    if (!p.panes.length) return { ...p, panes: [sessionId], focus: sessionId };
    const slot = Math.max(p.panes.indexOf(p.focus), 0);
    const panes = p.panes.map((id, i) => (i === slot ? sessionId : id));
    return { ...p, panes, focus: sessionId };
  });
}

const touch = (state, id) => ({
  ...state,
  sessions: state.sessions.map((s) => (s.id === id ? { ...s, lastActiveAt: Date.now() } : s)),
});

function reduce(state, action) {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'project/add': {
      const dir = action.path;
      const existing = state.projects.find((p) => p.path.toLowerCase() === dir.toLowerCase());
      if (existing) return state;
      const project = { id: action.id || newId(), name: path.basename(dir) || dir, path: dir, collapsed: false };
      return { ...state, projects: [...state.projects, project] };
    }
    case 'project/rename':
      return { ...state, projects: state.projects.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)) };
    case 'project/color': {
      const color = action.color == null ? null : String(action.color);
      if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) return state;
      return { ...state, projects: state.projects.map((p) => (p.id === action.id ? { ...p, color } : p)) };
    }
    case 'project/toggle':
      return { ...state, projects: state.projects.map((p) => (p.id === action.id ? { ...p, collapsed: !p.collapsed } : p)) };
    case 'project/remove': {
      const gone = new Set(state.sessions.filter((s) => s.projectId === action.id).map((s) => s.id));
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        sessions: state.sessions.filter((s) => !gone.has(s.id)),
        pages: state.pages.map((p) => dropPanes(p, gone)),
      };
    }

    case 'session/create': {
      const session = {
        id: action.id || newId(),
        projectId: action.projectId,
        agent: action.agent,
        title: action.title || 'New session',
        customTitle: Boolean(action.title),
        pinned: false,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      const withSession = { ...state, sessions: [...state.sessions, session] };
      return action.show === false ? withSession : showSession(withSession, session.id);
    }
    case 'session/show':
      return touch(showSession(state, action.id), action.id);
    case 'session/rename':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, title: action.title, customTitle: action.custom !== false } : s
        ),
      };
    case 'session/autotitle':
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id && !s.customTitle ? { ...s, title: action.title } : s)),
      };
    case 'session/started':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, started: true } : s)) };
    case 'session/pin':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, pinned: !s.pinned } : s)) };
    case 'session/remove': {
      const gone = new Set([action.id]);
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id), pages: state.pages.map((p) => dropPanes(p, gone)) };
    }

    case 'pane/split': {
      // Adds a session as a new pane next to the focused one.
      const idx = currentIndex(state);
      const page = state.pages[idx];
      if (page.panes.length >= MAX_PANES || page.panes.includes(action.sessionId)) return state;
      const at = Math.max(page.panes.indexOf(page.focus), 0) + 1;
      const panes = [...page.panes.slice(0, at), action.sessionId, ...page.panes.slice(at)];
      return mapPage(state, idx, (p) => ({ ...p, dir: action.dir || p.dir, panes, focus: action.sessionId, sizes: undefined }));
    }
    case 'pane/open': {
      // Focus it if already open anywhere; else add beside the focused pane (or replace it when full).
      const id = action.paneId;
      const pageIdx = state.pages.findIndex((p) => p.panes.includes(id));
      if (pageIdx >= 0) {
        const moved = { ...state, settings: { ...state.settings, page: pageIdx } };
        return mapPage(moved, pageIdx, (p) => ({ ...p, focus: id }));
      }
      return mapPage(state, currentIndex(state), (p) => {
        const slot = Math.max(p.panes.indexOf(p.focus), 0);
        if (p.panes.length >= MAX_PANES) {
          return { ...p, panes: p.panes.map((x, i) => (i === slot ? id : x)), focus: id };
        }
        const at = p.panes.length ? slot + 1 : 0;
        return { ...p, panes: [...p.panes.slice(0, at), id, ...p.panes.slice(at)], focus: id, sizes: undefined };
      });
    }
    case 'pane/place': {
      // Drag-and-drop: put a session beside (or in place of) a pane on the current page.
      // side: 'left' | 'right' | 'top' | 'bottom' | 'center'. The session stays on its own page too,
      // so closing this pane later leaves that page as it was.
      const id = action.sessionId;
      const sides = { left: ['row', 0], right: ['row', 1], top: ['col', 0], bottom: ['col', 1] };
      if (!state.sessions.some((x) => x.id === id) || !(action.side in sides || action.side === 'center')) return state;
      return mapPage(state, currentIndex(state), (p) => {
        const rest = p.panes.filter((x) => x !== id);
        const t = rest.indexOf(action.target);
        if (t < 0 || action.side === 'center' || rest.length >= MAX_PANES) {
          if (t < 0) return { ...p, panes: rest.length >= MAX_PANES ? rest : [...rest, id], focus: id, sizes: undefined };
          return { ...p, panes: rest.map((x, i) => (i === t ? id : x)), focus: id, sizes: undefined };
        }
        const [dir, after] = sides[action.side];
        const at = t + after;
        return { ...p, dir: rest.length === 1 ? dir : p.dir, panes: [...rest.slice(0, at), id, ...rest.slice(at)], focus: id, sizes: undefined };
      });
    }
    case 'pane/close':
      return mapPage(state, currentIndex(state), (p) => dropPanes(p, new Set([action.sessionId])));
    case 'pane/focus':
      return mapPage(state, currentIndex(state), (p) => ({ ...p, focus: action.sessionId }));
    case 'pane/sizes': {
      const idx = currentIndex(state);
      const page = state.pages[idx];
      const ok = Array.isArray(action.sizes) && action.sizes.length === page.panes.length && action.sizes.every((n) => Number.isFinite(n) && n > 0);
      return ok ? mapPage(state, idx, (p) => ({ ...p, sizes: action.sizes })) : state;
    }
    case 'pane/dir':
      return mapPage(state, currentIndex(state), (p) => ({ ...p, dir: action.dir }));

    case 'page/add':
      return {
        ...state,
        pages: [...state.pages, { id: newId(), dir: 'row', panes: [], focus: null }],
        settings: { ...state.settings, page: state.pages.length },
      };
    case 'page/go': {
      const page = (action.index + state.pages.length) % state.pages.length;
      return { ...state, settings: { ...state.settings, page } };
    }
    case 'page/remove': {
      if (state.pages.length <= 1) return state;
      const pages = state.pages.filter((_, i) => i !== action.index);
      return { ...state, pages, settings: { ...state.settings, page: Math.min(state.settings.page, pages.length - 1) } };
    }
    default:
      return state;
  }
}

function dropPanes(page, gone) {
  const panes = page.panes.filter((id) => !gone.has(id));
  const focus = panes.includes(page.focus) ? page.focus : panes[0] || null;
  const sizes = panes.length === page.panes.length ? page.sizes : undefined;
  return { ...page, panes, focus, sizes };
}

module.exports = { reduce, normalize, initialState, newId, DEFAULT_SETTINGS, MAX_PANES };
