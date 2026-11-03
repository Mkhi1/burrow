'use strict';

// "Open in Burrow" from the Explorer right-click menu passes a path on the command line.

const fs = require('node:fs');
const path = require('node:path');

/**
 * Find the folder/file the user right-clicked in the process arguments.
 * Returns { dir, file } (file is null for folders) or null.
 */
function targetFromArgv(argv, { exists = fs.existsSync, isDir = (p) => fs.statSync(p).isDirectory() } = {}) {
  // Skip the exe itself, flags, and the "." Electron gets in development.
  const candidates = argv.slice(1).filter((a) => a && !a.startsWith('-') && a !== '.');
  for (const raw of candidates.reverse()) {
    const p = path.resolve(raw.replace(/^"|"$/g, ''));
    if (/\.(exe|asar)$/i.test(p) || !exists(p)) continue;
    try {
      return isDir(p) ? { dir: p, file: null } : { dir: path.dirname(p), file: p };
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { targetFromArgv };
