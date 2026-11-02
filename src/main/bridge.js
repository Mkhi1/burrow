'use strict';

// Localhost-only HTTP bridge used by the Burrow MCP server so agents can see
// and talk to each other's sessions. Every request needs the per-launch token.

const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY = 64 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
  });
}

/** handlers: { list(), read(id, lines), send(from, to, text, submit), create(from, opts) } */
function startBridge(handlers) {
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    const reply = (code, data) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.headers['x-burrow-token'] !== token) return reply(401, { error: 'unauthorized' });
    try {
      const url = new URL(req.url, 'http://localhost');
      const from = String(req.headers['x-burrow-session'] || '');
      if (req.method === 'GET' && url.pathname === '/sessions') return reply(200, handlers.list(from));
      if (req.method === 'GET' && url.pathname === '/read') {
        const lines = Math.min(Number(url.searchParams.get('lines')) || 60, 400);
        return reply(200, handlers.read(url.searchParams.get('id'), lines));
      }
      if (req.method === 'POST' && url.pathname === '/send') {
        const { to, text, submit } = await readJson(req);
        if (typeof to !== 'string' || typeof text !== 'string' || !text) return reply(400, { error: 'to and text required' });
        return reply(200, handlers.send(from, to, text, submit !== false));
      }
      if (req.method === 'POST' && url.pathname === '/create') {
        return reply(200, await handlers.create(from, await readJson(req)));
      }
      return reply(404, { error: 'not found' });
    } catch (err) {
      return reply(500, { error: err.message });
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, token, close: () => server.close() }));
  });
}

module.exports = { startBridge };
