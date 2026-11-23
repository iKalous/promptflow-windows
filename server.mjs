import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnchors } from './src/domain/anchors.js';
import { FileScriptRepository } from './src/library/file-repository.js';
import { ensureTemplates } from './src/library/templates.js';
import { createLobbyHub } from './src/net/lobby-hub.js';
import { createIdFactory } from './src/ui/entry.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = new FileScriptRepository(path.join(root, 'data', 'library'));
ensureTemplates(repo, Date.now(), createIdFactory());

const lobby = createLobbyHub();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function safeId(id) {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (url.pathname === '/api/scripts' && request.method === 'GET') {
      send(response, 200, JSON.stringify({ scripts: repo.readAll() }));
      return;
    }
    const scriptMatch = url.pathname.match(/^\/api\/scripts\/([^/]+)$/);
    if (scriptMatch && request.method === 'PUT') {
      const id = decodeURIComponent(scriptMatch[1]);
      if (!safeId(id)) return send(response, 400, JSON.stringify({ ok: false }));
      const payload = await readBody(request);
      const body = String(payload.body ?? '');
      const title = String(payload.title ?? '未命名讲稿');
      const updatedAt = Number(payload.updatedAt ?? Date.now());
      const existing = repo.load(id);
      const text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const script = {
        id,
        title,
        body: text,
        updatedAt,
        anchors: parseAnchors(text)
      };
      if (existing) script.updatedAt = updatedAt;
      repo.save(script);
      send(response, 200, JSON.stringify({ ok: true, script: repo.load(id) }));
      return;
    }
    if (scriptMatch && request.method === 'DELETE') {
      const id = decodeURIComponent(scriptMatch[1]);
      send(response, 200, JSON.stringify(repo.remove(id)));
      return;
    }
    if (url.pathname === '/api/lobby' && request.method === 'POST') {
      const payload = await readBody(request);
      const opened = lobby.host(payload);
      if (!opened.ok) return send(response, 400, JSON.stringify(opened));
      send(response, 200, JSON.stringify(opened));
      return;
    }
    if (url.pathname === '/api/lobby/clock' && request.method === 'POST') {
      const updated = lobby.updateClock(await readBody(request));
      send(response, updated.ok ? 200 : 404, JSON.stringify(updated));
      return;
    }
    if (url.pathname === '/api/lobby/state' && request.method === 'GET') {
      const envelope = lobby.snapshot(Date.now());
      if (!envelope) return send(response, 404, JSON.stringify({ ok: false }));
      send(response, 200, JSON.stringify({ ok: true, envelope }));
      return;
    }
    if (url.pathname === '/api/join' && request.method === 'POST') {
      const joined = lobby.join(await readBody(request));
      send(response, 200, JSON.stringify(joined));
      return;
    }
    if (url.pathname === '/api/command' && request.method === 'POST') {
      const applied = lobby.command(await readBody(request));
      send(response, applied.ok || applied.code === 'readOnlyRole' ? 200 : 404, JSON.stringify(applied));
      return;
    }

    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return send(response, 403, 'forbidden', 'text/plain');
    const data = await readFile(filePath);
    send(response, 200, data, types[path.extname(filePath)] || 'application/octet-stream');
  } catch (error) {
    if (error && error.code === 'ENOENT') send(response, 404, 'missing', 'text/plain');
    else send(response, 500, 'error', 'text/plain');
  }
});

const port = Number(process.env.PORT || 47321);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`PromptFlow Windows http://127.0.0.1:${port}\n`);
});
