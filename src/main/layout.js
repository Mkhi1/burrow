'use strict';

// Split layouts as a small tree, so a page can mix side-by-side and stacked panes.
// A node is either a pane id (string) or a split: { dir: 'row' | 'col', kids: [node…], sizes: [n…] }.
// All functions are pure and return new trees.

const SIDES = { left: ['row', 0], right: ['row', 1], top: ['col', 0], bottom: ['col', 1] };

const isSplit = (node) => Boolean(node) && typeof node === 'object';

function leaves(node) {
  if (!node) return [];
  return isSplit(node) ? node.kids.flatMap(leaves) : [node];
}

/** Build a tree from the old flat layout (dir + panes + sizes). */
function fromFlat(dir, panes, sizes) {
  const ids = (panes || []).filter((id) => typeof id === 'string');
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  const ok = Array.isArray(sizes) && sizes.length === ids.length && sizes.every((n) => Number.isFinite(n) && n > 0);
  return { dir: dir === 'col' ? 'col' : 'row', kids: ids, sizes: ok ? sizes : ids.map(() => 1) };
}

/** Drop single-child splits and fold a split into a parent going the same way. */
function tidy(node) {
  if (!isSplit(node)) return node || null;
  const kids = [];
  const sizes = [];
  node.kids.forEach((kid, i) => {
    const t = tidy(kid);
    if (!t) return;
    const size = node.sizes?.[i] > 0 ? node.sizes[i] : 1;
    if (isSplit(t) && t.dir === node.dir) {
      const total = t.sizes.reduce((a, b) => a + b, 0);
      t.kids.forEach((k, j) => {
        kids.push(k);
        sizes.push((size * t.sizes[j]) / total);
      });
    } else {
      kids.push(t);
      sizes.push(size);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  return { dir: node.dir, kids, sizes };
}

function remove(node, id) {
  if (!node) return null;
  if (!isSplit(node)) return node === id ? null : node;
  return tidy({ ...node, kids: node.kids.map((k) => remove(k, id)) });
}

function replace(node, target, id) {
  if (!isSplit(node)) return node === target ? id : node;
  return { ...node, kids: node.kids.map((k) => replace(k, target, id)) };
}

/** Put `id` on one side of the pane `target`, splitting it in half. */
function insertBeside(node, target, id, side) {
  const [dir, after] = SIDES[side] || SIDES.right;
  if (!node) return id;
  const pair = (t) => ({ dir, kids: after ? [t, id] : [id, t], sizes: [1, 1] });
  if (!leaves(node).includes(target)) return tidy(pair(node)); // beside everything
  const walk = (n) => {
    if (!isSplit(n)) return n === target ? pair(n) : n;
    const i = n.kids.indexOf(target);
    if (i >= 0 && n.dir === dir) {
      // same direction: share the target's space with the new pane
      const half = n.sizes[i] / 2;
      const at = i + after;
      const kids = [...n.kids.slice(0, at), id, ...n.kids.slice(at)];
      const sizes = n.sizes.map((s, j) => (j === i ? half : s));
      sizes.splice(at, 0, half);
      return { ...n, kids, sizes };
    }
    return { ...n, kids: n.kids.map(walk) };
  };
  return tidy(walk(node));
}

/** Swap two panes in place. */
function swap(node, a, b) {
  if (!isSplit(node)) return node === a ? b : node === b ? a : node;
  return { ...node, kids: node.kids.map((k) => swap(k, a, b)) };
}

/** Set the sizes of the split at `path` (child indexes from the root). */
function setSizes(node, path, sizes) {
  const ok = Array.isArray(sizes) && sizes.every((n) => Number.isFinite(n) && n > 0);
  if (!ok || !Array.isArray(path)) return node;
  const walk = (n, depth) => {
    if (!isSplit(n)) return n;
    if (depth === path.length) return sizes.length === n.kids.length ? { ...n, sizes } : n;
    const i = path[depth];
    if (!Number.isInteger(i) || i < 0 || i >= n.kids.length) return n;
    return { ...n, kids: n.kids.map((k, j) => (j === i ? walk(k, depth + 1) : k)) };
  };
  return walk(node, 0);
}

/** Check a stored tree; anything malformed becomes null. */
function sanitize(node, seen = new Set()) {
  if (typeof node === 'string') {
    if (seen.has(node)) return null;
    seen.add(node);
    return node;
  }
  if (!isSplit(node) || !Array.isArray(node.kids) || (node.dir !== 'row' && node.dir !== 'col')) return null;
  const sizes = Array.isArray(node.sizes) ? node.sizes : [];
  return tidy({ dir: node.dir, kids: node.kids.map((k) => sanitize(k, seen)), sizes: node.kids.map((_, i) => (sizes[i] > 0 ? sizes[i] : 1)) });
}

module.exports = { leaves, fromFlat, tidy, remove, replace, swap, insertBeside, setSizes, sanitize, SIDES };
