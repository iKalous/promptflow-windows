import { pause, resume, setSpeed } from './clock.js';
import { stepAnchor } from './anchor-step.js';

export function applyAuthorityCommand(session, role, command, now) {
  if (role === 'prompter') return { ok: false, code: 'readOnlyRole', session };
  if (session.role === 'prompter') return { ok: false, code: 'readOnlyRole', session };
  const length = session.snapshotBody.length;
  if (command === 'pause') {
    return { ok: true, session: { ...session, clock: pause(session.clock, now, length) } };
  }
  if (command === 'resume') {
    return { ok: true, session: { ...session, clock: resume(session.clock, now, length) } };
  }
  if (command === 'setSpeed') {
    return { ok: true, session: { ...session, clock: setSpeed(session.clock, session.clock.speed, now, length) } };
  }
  if (command === 'jumpAnchor') {
    const at = stepAnchor(session.anchors, session.clock.offsetChars, 1);
    if (at === null) return { ok: true, session };
    const projected = pause(session.clock, now, length);
    return {
      ok: true,
      session: { ...session, clock: { ...projected, playing: session.clock.playing, offsetChars: at, updatedAt: now } }
    };
  }
  return { ok: false, code: 'illegalTransition', session };
}
