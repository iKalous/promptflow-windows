import { resume } from './clock.js';
import { parseAnchors } from './anchors.js';

export function startSolo(id, scriptId, body, now) {
  const snapshotBody = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return {
    id,
    scriptId,
    role: 'solo',
    status: 'live',
    revision: 1,
    snapshotBody,
    anchors: parseAnchors(snapshotBody),
    clock: { playing: true, speed: 1, offsetChars: 0, updatedAt: now, loop: false },
    joinTicket: null,
    prompterJoined: false
  };
}

export function startSplit(id, scriptId, body, now) {
  return startSolo(id, scriptId, body, now);
}

export function applyLinkLost(session) {
  if (session.role === 'solo' || session.status !== 'live') return session;
  return { ...session, status: 'degraded' };
}

export function applyResume(session, role, now) {
  if (role === 'prompter') return { ok: false, code: 'readOnlyRole' };
  if (session.status === 'ended' || session.status === 'idle') return { ok: false, code: 'illegalTransition' };
  return {
    ok: true,
    session: { ...session, clock: resume(session.clock, now, session.snapshotBody.length) }
  };
}
