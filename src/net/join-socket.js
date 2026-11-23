import net from 'node:net';
import { applyAuthorityCommand } from '../domain/authority.js';
import { acceptTcpJoin } from '../domain/messages.js';

export function handleJoinLine(holder, line, now) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    return JSON.stringify({ v: 1, error: 'joinRejected' });
  }
  if (!parsed || typeof parsed !== 'object') return JSON.stringify({ v: 1, error: 'joinRejected' });
  if (parsed.type === 'join') {
    const result = acceptTcpJoin(holder.authority, line, now);
    if (result.ok) holder.authority = result.session;
    return result.line;
  }
  if (parsed.type === 'command') {
    const applied = applyAuthorityCommand(holder.authority, parsed.role, parsed.command, now);
    if (applied.ok) holder.authority = applied.session;
    return JSON.stringify({
      ok: applied.ok,
      code: applied.code ?? null,
      offsetChars: applied.session.clock.offsetChars,
      playing: applied.session.clock.playing
    });
  }
  return JSON.stringify({ v: 1, error: 'joinRejected' });
}

export function startJoinServer(holder) {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const reply = handleJoinLine(holder, line, Date.now());
        socket.write(`${reply}\n`);
        newline = buffer.indexOf('\n');
      }
    });
  });
  return server;
}

export function commandLine(role, command) {
  return JSON.stringify({ v: 1, type: 'command', role, command });
}
