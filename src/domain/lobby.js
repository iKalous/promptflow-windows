import { resume } from './clock.js';
import { parseAnchors } from './anchors.js';
import { PASS_MS, isSixDigits, normalizePasscode } from './passcode.js';

export function openLobby(session, id, scriptId, body, code, now) {
  if (session !== null && session.status !== 'idle') {
    return { ok: false, code: 'illegalTransition', session };
  }
  const normalized = normalizePasscode(code);
  if (!isSixDigits(normalized)) {
    return { ok: false, code: 'illegalTransition', session };
  }
  const snapshotBody = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const keptId = session === null ? id : session.id;
  return {
    ok: true,
    session: {
      id: keptId,
      scriptId,
      role: 'director',
      status: 'idle',
      revision: 1,
      snapshotBody,
      anchors: parseAnchors(snapshotBody),
      clock: { playing: false, speed: 1, offsetChars: 0, updatedAt: now, loop: false },
      joinTicket: { code: normalized, expiresAt: now + PASS_MS },
      prompterJoined: false
    }
  };
}

export function regenerateTicket(session, code, now) {
  const normalized = normalizePasscode(code);
  if (session.role !== 'director' || session.status !== 'idle' || session.joinTicket === null || !isSixDigits(normalized)) {
    return { ok: false, code: 'illegalTransition', session };
  }
  return {
    ok: true,
    session: {
      ...session,
      joinTicket: { code: normalized, expiresAt: now + PASS_MS }
    }
  };
}

export function checkJoin(session, typed, now) {
  if (session.joinTicket === null) return { ok: false, code: 'joinRejected' };
  if (session.role !== 'director') return { ok: false, code: 'joinRejected' };
  if (session.status === 'ended') return { ok: false, code: 'joinRejected' };
  const normalized = normalizePasscode(typed);
  if (!isSixDigits(normalized)) return { ok: false, code: 'joinRejected' };
  if (normalized !== session.joinTicket.code) return { ok: false, code: 'joinRejected' };
  if (now >= session.joinTicket.expiresAt) return { ok: false, code: 'joinRejected' };
  if (session.prompterJoined) return { ok: false, code: 'prompterOccupied' };
  return { ok: true };
}

export function claimPrompter(session) {
  return { ...session, prompterJoined: true };
}

export function peerReady(session, now) {
  if (session.role === 'prompter') return { ok: false, code: 'readOnlyRole', session };
  if (session.status === 'ended') return { ok: false, code: 'illegalTransition', session };
  if (session.status === 'idle') {
    return {
      ok: true,
      session: {
        ...session,
        status: 'live',
        prompterJoined: true,
        clock: { ...session.clock, playing: false, updatedAt: now }
      }
    };
  }
  if (session.status === 'degraded') {
    return { ok: true, session: { ...session, status: 'live', prompterJoined: true } };
  }
  return { ok: true, session: { ...session, prompterJoined: true } };
}

export function startScrolling(session, now) {
  if (session.role === 'prompter') return { ok: false, code: 'readOnlyRole', session };
  if (session.status === 'ended') return { ok: false, code: 'illegalTransition', session };
  const clock = resume(session.clock, now, session.snapshotBody.length);
  const status = session.status === 'idle' ? 'live' : session.status;
  return { ok: true, session: { ...session, status, clock, revision: session.revision + 1 } };
}

export function canStartScrolling(status) {
  return status === 'live' || status === 'degraded';
}

export function becomePrompter(session) {
  return { ...session, role: 'prompter', joinTicket: null, prompterJoined: false };
}
