import { checkJoin, claimPrompter, peerReady } from './lobby.js';
import { isSixDigits, normalizePasscode } from './passcode.js';
import { toEnvelope } from './push-snapshot.js';

export function qrText(code, offer) {
  if (offer === null) return JSON.stringify({ v: 1, code });
  return JSON.stringify({ v: 1, code, host: offer.host, port: offer.port });
}

export function broadcastText(code) {
  return JSON.stringify({ code });
}

export function joinLine(code, deviceName) {
  return JSON.stringify({ v: 1, type: 'join', code, deviceName });
}

export function errorLine(code, error) {
  return JSON.stringify({ v: 1, code, error });
}

export function envelopeLine(session, sentAt) {
  return JSON.stringify({ v: 1, type: 'envelope', ...toEnvelope(session, null, sentAt) });
}

export function replyToBroadcast(session, datagram, offer, now) {
  const code = broadcastCode(datagram);
  if (code === null) return { session, reply: null };
  const checked = checkJoin(session, code, now);
  if (checked.ok === false) return { session, reply: errorLine(normalizePasscode(code), checked.code) };
  if (offer === null || session.joinTicket === null) return { session, reply: null };
  return { session, reply: qrText(session.joinTicket.code, offer) };
}

export function acceptTcpJoin(session, line, now) {
  const code = joinCode(line);
  if (code === null) {
    return { ok: false, code: 'joinRejected', session, line: JSON.stringify({ v: 1, error: 'joinRejected' }) };
  }
  const checked = checkJoin(session, code, now);
  if (checked.ok === false) {
    return { ok: false, code: checked.code, session, line: errorLine(normalizePasscode(code), checked.code) };
  }
  const ready = peerReady(claimPrompter(session), now);
  if (!ready.ok) {
    return { ok: false, code: 'joinRejected', session, line: errorLine(normalizePasscode(code), 'joinRejected') };
  }
  return { ok: true, session: ready.session, line: envelopeLine(ready.session, now) };
}

export function parseQr(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const fromJson = qrFromJson(trimmed);
    if (fromJson !== 'not-json') return fromJson;
  }
  const code = normalizePasscode(trimmed);
  if (isSixDigits(code)) return { kind: 'code', code };
  return { kind: 'invalid' };
}

export function parseDirectorReply(json, expectedCode) {
  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object') return { ok: false, code: 'ignore' };
    if (typeof parsed.code === 'string' && parsed.code !== expectedCode) return { ok: false, code: 'ignore' };
    const error = joinFailure(parsed.error);
    if (error !== null) return { ok: false, code: error };
    if (parsed.v === 1 && parsed.code === expectedCode
      && typeof parsed.host === 'string' && typeof parsed.port === 'number') {
      return { ok: true, host: parsed.host, port: parsed.port };
    }
    return { ok: false, code: 'ignore' };
  } catch {
    return { ok: false, code: 'ignore' };
  }
}

export function parseJoinResult(line) {
  try {
    const parsed = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return { kind: 'ignore' };
    if (parsed.type === 'envelope' && parsed.v === 1) {
      const envelope = envelopeFrom(parsed);
      if (envelope === null) return { kind: 'ignore' };
      return { kind: 'envelope', envelope };
    }
    const error = joinFailure(parsed.error);
    if (error !== null) return { kind: 'rejected', code: error };
    return { kind: 'ignore' };
  } catch {
    return { kind: 'ignore' };
  }
}

function broadcastCode(datagram) {
  try {
    const parsed = JSON.parse(datagram);
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.code !== 'string') return null;
    return parsed.code;
  } catch {
    return null;
  }
}

function joinCode(line) {
  try {
    const parsed = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return null;
    if (parsed.v !== 1 || parsed.type !== 'join') return null;
    if (typeof parsed.code !== 'string' || typeof parsed.deviceName !== 'string') return null;
    return parsed.code;
  } catch {
    return null;
  }
}

function qrFromJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return { kind: 'invalid' };
    if (parsed.v === 1 && typeof parsed.code === 'string' && isSixDigits(parsed.code)) {
      if (typeof parsed.host === 'string' && typeof parsed.port === 'number') {
        return { kind: 'direct', code: parsed.code, host: parsed.host, port: parsed.port };
      }
      return { kind: 'code', code: parsed.code };
    }
    return { kind: 'invalid' };
  } catch {
    return 'not-json';
  }
}

function joinFailure(error) {
  if (error === 'joinRejected' || error === 'prompterOccupied') return error;
  return null;
}

function isSessionStatus(status) {
  return status === 'idle' || status === 'live' || status === 'degraded' || status === 'ended';
}

function commandOf(command) {
  if (command === null) return { ok: true, command: null };
  if (command === 'pause' || command === 'resume' || command === 'setSpeed'
    || command === 'jumpAnchor' || command === 'pushSnapshot' || command === 'end') {
    return { ok: true, command };
  }
  return { ok: false };
}

function envelopeFrom(parsed) {
  if (typeof parsed.sessionId !== 'string') return null;
  if (typeof parsed.revision !== 'number') return null;
  if (!isSessionStatus(parsed.status)) return null;
  if (typeof parsed.playing !== 'boolean') return null;
  if (typeof parsed.speed !== 'number') return null;
  if (typeof parsed.offsetChars !== 'number') return null;
  if (typeof parsed.updatedAt !== 'number') return null;
  if (typeof parsed.loop !== 'boolean') return null;
  if (typeof parsed.snapshotBody !== 'string') return null;
  if (typeof parsed.sentAt !== 'number') return null;
  const command = commandOf(parsed.command);
  if (!command.ok) return null;
  return {
    sessionId: parsed.sessionId,
    revision: parsed.revision,
    status: parsed.status,
    playing: parsed.playing,
    speed: parsed.speed,
    offsetChars: parsed.offsetChars,
    updatedAt: parsed.updatedAt,
    loop: parsed.loop,
    snapshotBody: parsed.snapshotBody,
    command: command.command,
    sentAt: parsed.sentAt
  };
}
