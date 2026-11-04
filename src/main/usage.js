'use strict';

// Finds agent transcripts, parses changed ones in a worker, caches results on disk.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { aggregate } = require('./usageAggregate');

const CACHE_VERSION = 2; // 2: summaries also keep per-hour totals
const ROOTS = [
  { agent: 'claude', dir: path.join(os.homedir(), '.claude', 'projects') },
  { agent: 'codex', dir: path.join(os.homedir(), '.codex', 'sessions') },
];

async function walk(dir, agent, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full, agent, out);
      if (!e.name.endsWith('.jsonl')) return;
      try {
        const st = await fs.promises.stat(full);
        out.push({ path: full, agent, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* vanished mid-scan */
      }
    })
  );
  return out;
}

// In a packaged app the worker files live outside the asar archive.
const workerPath = () => path.join(__dirname, 'usageWorker.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

class UsageService {
  constructor(cacheFile) {
    this.cacheFile = cacheFile;
    this.cache = new Map(); // path -> { mtimeMs, size, summary }
    this.scanning = null;
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (raw.version === CACHE_VERSION) this.cache = new Map(Object.entries(raw.files));
    } catch {
      /* first run */
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const data = JSON.stringify({ version: CACHE_VERSION, files: Object.fromEntries(this.cache) });
        fs.writeFileSync(this.cacheFile + '.tmp', data);
        fs.renameSync(this.cacheFile + '.tmp', this.cacheFile);
      } catch (err) {
        console.error('usage cache save failed', err);
      }
    }, 500);
  }

  /** Rescan disk; parse only new/changed files. onProgress(done, total). */
  scan(onProgress = () => {}) {
    if (this.scanning) return this.scanning;
    this.scanning = (async () => {
      const files = (await Promise.all(ROOTS.map((r) => walk(r.dir, r.agent, [])))).flat();
      const live = new Set(files.map((f) => f.path));
      for (const p of this.cache.keys()) if (!live.has(p)) this.cache.delete(p);
      const todo = files.filter((f) => {
        const c = this.cache.get(f.path);
        return !c || c.mtimeMs !== f.mtimeMs || c.size !== f.size;
      });
      // Newest first so recent numbers are ready soonest.
      todo.sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (todo.length) await this.parse(todo, onProgress);
      this.save();
      return { files: files.length, parsed: todo.length };
    })().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  parse(todo, onProgress) {
    const meta = new Map(todo.map((f) => [f.path, f]));
    return new Promise((resolve) => {
      const worker = new Worker(workerPath());
      let done = 0;
      worker.on('message', (msg) => {
        if (msg.type === 'file') {
          const f = meta.get(msg.path);
          this.cache.set(msg.path, { mtimeMs: f.mtimeMs, size: f.size, summary: msg.summary });
        }
        if (msg.type === 'file' || msg.type === 'error') {
          done += 1;
          if (done % 25 === 0 || done === todo.length) onProgress(done, todo.length);
        }
        if (msg.type === 'done') {
          worker.terminate();
          resolve();
        }
      });
      worker.on('error', (err) => {
        console.error('usage worker failed', err);
        resolve();
      });
      worker.postMessage({ files: todo.map(({ path: p, agent }) => ({ path: p, agent })) });
    });
  }

  summary(opts) {
    return aggregate([...this.cache.values()].map((c) => c.summary), opts);
  }
}

module.exports = { UsageService };
