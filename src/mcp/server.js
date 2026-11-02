#!/usr/bin/env node
'use strict';

// Burrow MCP server (stdio, newline-delimited JSON-RPC). Lets an agent list the
// other Burrow sessions, read their output, message them, and start new ones.

const http = require('node:http');
const readline = require('node:readline');

const PORT = process.env.BURROW_PORT;
const TOKEN = process.env.BURROW_TOKEN;
const SESSION = process.env.BURROW_SESSION_ID || '';

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: { 'x-burrow-token': TOKEN, 'x-burrow-session': SESSION, 'content-type': 'application/json' },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(out);
            res.statusCode >= 400 ? reject(new Error(json.error || `HTTP ${res.statusCode}`)) : resolve(json);
          } catch {
            reject(new Error('bad response from Burrow'));
          }
        });
      }
    );
    req.on('error', () => reject(new Error('Burrow app is not reachable (is it running?)')));
    if (data) req.write(data);
    req.end();
  });
}

const TOOLS = [
  {
    name: 'sessions_list',
    description: 'List every Burrow session (id, title, agent, project, status). Your own session is marked self:true.',
    inputSchema: { type: 'object', properties: {} },
    run: () => call('GET', '/sessions'),
  },
  {
    name: 'sessions_read',
    description: 'Read the recent plain-text terminal output of another session.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, lines: { type: 'number', description: 'max lines (default 60)' } },
      required: ['id'],
    },
    run: ({ id, lines }) => call('GET', `/read?id=${encodeURIComponent(id)}&lines=${Number(lines) || 60}`),
  },
  {
    name: 'sessions_send_text',
    description: 'Type a message into another session\'s agent prompt and submit it (set submit:false to only type).',
    inputSchema: {
      type: 'object',
      properties: { to: { type: 'string', description: 'session id' }, text: { type: 'string' }, submit: { type: 'boolean' } },
      required: ['to', 'text'],
    },
    run: (args) => call('POST', '/send', args),
  },
  {
    name: 'sessions_create',
    description: 'Start a new agent session in the same (or a given) project, optionally with a first prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'claude | codex | gemini | opencode | cursor | kimi | shell' },
        prompt: { type: 'string' },
        title: { type: 'string' },
        projectPath: { type: 'string' },
      },
    },
    run: (args) => call('POST', '/create', args),
  },
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return result(id, {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'burrow', version: '0.1.0' },
    });
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS.map(({ run, ...t }) => t) });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return error(id, -32602, `unknown tool ${params?.name}`);
    try {
      const out = await tool.run(params.arguments || {});
      return result(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (err) {
      return result(id, { content: [{ type: 'text', text: err.message }], isError: true });
    }
  }
  if (id !== undefined) error(id, -32601, `method not found: ${method}`);
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch {
    error(null, -32700, 'parse error');
  }
});
