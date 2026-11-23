import { applyAuthorityCommand } from '../domain/authority.js';
import { project } from '../domain/clock.js';
import { openLobby } from '../domain/lobby.js';
import { acceptTcpJoin, joinLine, parseJoinResult } from '../domain/messages.js';
import { pushSnapshot, toEnvelope } from '../domain/push-snapshot.js';

export function createLobbyHub() {
  const holder = { authority: null };

  function host(payload) {
    const opened = openLobby(
      null,
      String(payload.id || 'lobby'),
      String(payload.scriptId || 'script'),
      String(payload.body || ''),
      String(payload.code || ''),
      Number(payload.now || 0)
    );
    if (!opened.ok) return opened;
    holder.authority = {
      ...opened.session,
      clock: {
        ...opened.session.clock,
        offsetChars: Number(payload.offsetChars || 0),
        speed: Number(payload.speed || 1),
        playing: payload.playing === true,
        loop: payload.loop === true,
        updatedAt: Number(payload.updatedAt || payload.now || 0)
      }
    };
    return { ok: true, code: holder.authority.joinTicket.code, expiresAt: holder.authority.joinTicket.expiresAt };
  }

  function updateClock(payload) {
    if (!holder.authority) return { ok: false };
    let session = holder.authority;
    if (typeof payload.body === 'string' && payload.body !== session.snapshotBody) {
      session = pushSnapshot(session, payload.body, Number(payload.updatedAt || 0));
    }
    const at = Number(payload.updatedAt || 0);
    holder.authority = {
      ...session,
      clock: {
        playing: payload.playing === true,
        speed: Number(payload.speed || session.clock.speed),
        offsetChars: Number(payload.offsetChars ?? session.clock.offsetChars),
        updatedAt: at,
        loop: payload.loop === true
      }
    };
    return { ok: true, offsetChars: holder.authority.clock.offsetChars };
  }

  function join(payload) {
    if (!holder.authority) return { ok: false, code: 'joinRejected' };
    const at = Number(payload.now || 0);
    const directorClock = project(holder.authority.clock, at, holder.authority.snapshotBody.length);
    holder.authority = { ...holder.authority, clock: directorClock };
    const result = acceptTcpJoin(
      holder.authority,
      joinLine(String(payload.code || ''), String(payload.deviceName || 'phone')),
      at
    );
    if (!result.ok) return { ok: false, code: result.code };
    holder.authority = { ...result.session, clock: directorClock };
    const parsed = parseJoinResult(result.line);
    if (parsed.kind !== 'envelope') return { ok: false, code: 'joinRejected' };
    return { ok: true, envelope: parsed.envelope, offsetChars: parsed.envelope.offsetChars };
  }

  function snapshot(now) {
    if (!holder.authority) return null;
    const clock = project(holder.authority.clock, now, holder.authority.snapshotBody.length);
    holder.authority = { ...holder.authority, clock };
    return toEnvelope(holder.authority, null, now);
  }

  function command(payload) {
    if (!holder.authority) return { ok: false, code: 'notFound' };
    const applied = applyAuthorityCommand(holder.authority, payload.role, payload.command, Number(payload.now || 0));
    if (applied.ok) holder.authority = applied.session;
    return {
      ok: applied.ok,
      code: applied.code ?? null,
      offsetChars: applied.session.clock.offsetChars,
      playing: applied.session.clock.playing
    };
  }

  return { host, updateClock, join, snapshot, command };
}
