import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project } from '../src/domain/clock.js';
import { openLobby, startScrolling } from '../src/domain/lobby.js';
import { dropFollower, followerFromEnvelope } from '../src/domain/loss.js';
import { templateBody, TEMPLATES } from '../src/library/templates.js';
import { commandLine, startJoinServer } from '../src/net/join-socket.js';
import { parseJoinResult } from '../src/domain/messages.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        socket.off('data', onData);
        resolve(buffer.slice(0, newline));
      }
    };
    socket.on('data', onData);
    socket.on('error', reject);
  });
}

if (process.argv[2] === 'join') {
  const port = Number(process.argv[3]);
  const code = process.argv[4];
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.setEncoding('utf8');
  socket.on('connect', () => {
    socket.write(`${JSON.stringify({ v: 1, type: 'join', code, deviceName: 'second-process' })}\n`);
  });
  const joinedLine = await readLine(socket);
  const parsed = parseJoinResult(joinedLine);
  if (parsed.kind !== 'envelope') {
    process.stdout.write(`${JSON.stringify({ step: 'join', ok: false, line: joinedLine })}\n`);
    socket.end();
    process.exit(1);
  }
  const follower = followerFromEnvelope(parsed.envelope);
  socket.write(`${commandLine('prompter', 'pause')}\n`);
  const command = JSON.parse(await readLine(socket));
  const wrong = net.connect({ host: '127.0.0.1', port });
  wrong.setEncoding('utf8');
  wrong.on('connect', () => {
    wrong.write(`${JSON.stringify({ v: 1, type: 'join', code: '000000', deviceName: 'wrong' })}\n`);
  });
  const rejected = await readLine(wrong);
  const dropped = dropFollower(follower);
  process.stdout.write(`${JSON.stringify({
    step: 'join',
    ok: true,
    snapshotOffset: parsed.envelope.offsetChars,
    snapshotHasHeading: parsed.envelope.snapshotBody.includes('## 选题'),
    prompterCommand: command,
    rejected,
    droppedOffset: dropped.offsetChars,
    droppedStatus: dropped.session.status
  })}\n`);
  socket.end();
  wrong.end();
  process.exit(0);
}

const body = templateBody(TEMPLATES[1]);
const now = Date.now();
const opened = openLobby(null, 'live-director', 'defense', body, '246810', now);
if (!opened.ok) throw new Error('mint');
let authority = startScrolling(opened.session, now).session;
authority = { ...authority, clock: project(authority.clock, now + 2_000, authority.snapshotBody.length) };
const holder = { authority };
const server = startJoinServer(holder);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const child = spawn(process.execPath, [path.join(here, 'live-join.mjs'), 'join', String(port), '246810'], {
  stdio: ['ignore', 'pipe', 'pipe']
});
let childOut = '';
child.stdout.on('data', (chunk) => { childOut += chunk; });
const exitCode = await new Promise((resolve) => child.on('exit', resolve));
const report = JSON.parse(childOut.trim());
const record = {
  directorCode: holder.authority.joinTicket.code,
  directorOffset: authority.clock.offsetChars,
  authorityOffsetAfterPrompter: holder.authority.clock.offsetChars,
  authorityPlayingAfterPrompter: holder.authority.clock.playing,
  childExit: exitCode,
  ...report
};
process.stdout.write(`${JSON.stringify(record)}\n`);
server.close();
if (exitCode !== 0 || report.snapshotOffset !== authority.clock.offsetChars || report.prompterCommand.ok !== false || report.droppedOffset === 0) {
  process.exit(1);
}
