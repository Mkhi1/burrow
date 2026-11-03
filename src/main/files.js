'use strict';

// File access for the editor. Every path is checked to stay inside its project folder.

const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'release', 'out', '.next', '.nuxt', '.svelte-kit',
  'target', 'venv', '.venv', '__pycache__', '.cache', 'coverage', '.idea', '.vs', 'bin', 'obj',
]);
const MAX_FILES = 20000;
const MAX_BYTES = 5 * 1024 * 1024;

const isInside = (base, full) => {
  const b = base.toLowerCase();
  const f = full.toLowerCase();
  return f === b || f.startsWith(b + path.sep);
};

/** Real location on disk (follows symlinks); for a new file, its folder's real location. */
function realLocation(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.join(fs.realpathSync.native(path.dirname(p)), path.basename(p));
  }
}

/**
 * Resolve rel inside root, or throw if it escapes the folder,
 * including through symlinks/junctions that point elsewhere.
 */
function safeJoin(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (!isInside(base, full)) throw new Error('Path is outside the project');
  let realBase;
  try {
    realBase = fs.realpathSync.native(base);
  } catch {
    return full; // project folder missing: nothing on disk to escape through
  }
  if (!isInside(realBase, realLocation(full))) throw new Error('Path is outside the project');
  return full;
}

/** All files under root (relative, forward slashes), skipping heavy folders. */
async function listFiles(root) {
  const out = [];
  async function walk(dir, prefix) {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(path.join(dir, e.name), rel);
      } else if (e.isFile()) out.push(rel);
    }
  }
  await walk(path.resolve(root), '');
  return out;
}

async function readText(root, rel) {
  const full = safeJoin(root, rel);
  const st = await fs.promises.stat(full);
  if (st.size > MAX_BYTES) throw new Error('File is too large to open (over 5 MB)');
  const buf = await fs.promises.readFile(full);
  if (buf.subarray(0, 8000).includes(0)) throw new Error('This looks like a binary file');
  return { text: buf.toString('utf8'), mtimeMs: st.mtimeMs };
}

async function writeText(root, rel, text) {
  const full = safeJoin(root, rel);
  if (typeof text !== 'string') throw new Error('Nothing to save');
  await fs.promises.writeFile(full, text, 'utf8');
  return { mtimeMs: (await fs.promises.stat(full)).mtimeMs };
}

/** Watch one file; calls onChange (debounced) when it changes on disk. Returns stop(). */
function watchFile(root, rel, onChange) {
  const full = safeJoin(root, rel);
  let timer = null;
  let watcher = null;
  try {
    watcher = fs.watch(full, () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 150);
    });
  } catch {
    return () => {};
  }
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

module.exports = { safeJoin, listFiles, readText, writeText, watchFile, SKIP_DIRS };
