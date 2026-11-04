'use strict';

// Pure, immutable state transitions. Everything persistent goes through here.

const crypto = require('node:crypto');
const path = require('node:path');
const layout = require('./layout');

const newId = () => crypto.randomUUID().slice(0, 8);
const MAX_PANES = 6;

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
  pages: [{ id: newId(), panes: [], tree: null, focus: null }],
});

const migrateSettings = (s) => (s.accent === '#e8825a' ? { ...s, accent: DEFAULT_SETTINGS.accent } : s);

function normalize(raw) {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const pages = (Array.isArray(raw.pages) && raw.pages.length ? raw.pages : base.pages).map(migratePage);
  return {
    settings: migrateSettings({ ...DEFAULT_SETTINGS, ...(raw.settings || {}) }),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    pages,
  };
}

/** Pages store a split tree; `panes` is kept as its flat list of pane ids. */
function migratePage(p) {
  const tree = 'tree' in p ? layout.sanitize(p.tree) : layout.fromFlat(p.dir, p.panes, p.sizes);
  const panes = layout.leaves(tree);
  return { id: p.id || newId(), panes, tree, focus: panes.includes(p.focus) ? p.focus : panes[0] || null };
}

const withTree = (page, tree, focus = page.focus) => {
  const panes = layout.leaves(tree);
  return { ...page, tree, panes, focus: panes.includes(focus) ? focus : panes[0] || null };
};

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
    if (!p.panes.length) return withTree(p, sessionId, sessionId);
    const slot = p.panes.includes(p.focus) ? p.focus : p.panes[0];
    return withTree(p, layout.replace(p.tree, slot, sessionId), sessionId);
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
      const side = action.dir === 'col' ? 'bottom' : 'right';
      return mapPage(state, idx, (p) => withTree(p, layout.insertBeside(p.tree, p.focus, action.sessionId, side), action.sessionId));
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
        const slot = p.panes.includes(p.focus) ? p.focus : p.panes[0];
        if (p.panes.length >= MAX_PANES) return withTree(p, layout.replace(p.tree, slot, id), id);
        return withTree(p, layout.insertBeside(p.tree, slot, id, 'right'), id);
      });
    }
    case 'pane/place': {
      // Drag-and-drop: put a session (or a pane already on this page) beside, or in place of, a pane.
      // side: 'left' | 'right' | 'top' | 'bottom' | 'center'. Any pane can be split either way, so
      // layouts can mix side-by-side and stacked panes. A session keeps its own page too.
      const id = action.sessionId;
      const idx = currentIndex(state);
      const known = state.sessions.some((x) => x.id === id) || state.pages[idx].panes.includes(id);
      if (!known || !(action.side in layout.SIDES || action.side === 'center')) return state;
      return mapPage(state, idx, (p) => {
        const rest = layout.remove(p.tree, id);
        const ids = layout.leaves(rest);
        const hit = ids.includes(action.target);
        if (!rest) return withTree(p, id, id);
        if (action.side === 'center' || ids.length >= MAX_PANES) {
          return hit ? withTree(p, layout.replace(rest, action.target, id), id) : p;
        }
        return withTree(p, layout.insertBeside(rest, hit ? action.target : null, id, action.side), id);
      });
    }
    case 'pane/swap': {
      const idx = currentIndex(state);
      const { panes } = state.pages[idx];
      if (action.a === action.b || !panes.includes(action.a) || !panes.includes(action.b)) return state;
      return mapPage(state, idx, (p) => withTree(p, layout.swap(p.tree, action.a, action.b), action.a));
    }
    case 'pane/close':
      return mapPage(state, currentIndex(state), (p) => dropPanes(p, new Set([action.sessionId])));
    case 'pane/focus':
      return mapPage(state, currentIndex(state), (p) => ({ ...p, focus: action.sessionId }));
    case 'pane/sizes': {
      // Sizes of one split in the tree, found by its path of child indexes.
      const idx = currentIndex(state);
      const tree = layout.setSizes(state.pages[idx].tree, action.path || [], action.sizes);
      return tree === state.pages[idx].tree ? state : mapPage(state, idx, (p) => ({ ...p, tree }));
    }

    case 'page/add':
      return {
        ...state,
        pages: [...state.pages, { id: newId(), panes: [], tree: null, focus: null }],
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
  if (!page.panes.some((id) => gone.has(id))) return page;
  return withTree(page, [...gone].reduce((t, id) => layout.remove(t, id), page.tree));
}

module.exports = { reduce, normalize, initialState, newId, DEFAULT_SETTINGS, MAX_PANES };
