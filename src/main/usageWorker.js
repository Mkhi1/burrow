'use strict';

// Runs off the main thread: parses transcript files and streams summaries back.
const { parentPort } = require('node:worker_threads');
const { parseFile } = require('./usageParse');

parentPort.on('message', async ({ files }) => {
  for (const f of files) {
    try {
      parentPort.postMessage({ type: 'file', path: f.path, summary: await parseFile(f.path, f.agent) });
    } catch (err) {
      parentPort.postMessage({ type: 'error', path: f.path, error: err.message });
    }
  }
  parentPort.postMessage({ type: 'done' });
});
