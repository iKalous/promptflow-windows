import { project } from './clock.js';
import { align } from './align.js';
import { parseAnchors } from './anchors.js';

export function pushSnapshot(session, newBody, now) {
  const projected = project(session.clock, now, session.snapshotBody.length);
  const snapshotBody = newBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const anchors = parseAnchors(snapshotBody);
  const offsetChars = align(session.anchors, projected.offsetChars, anchors, snapshotBody.length);
  return {
    ...session,
    snapshotBody,
    anchors,
    revision: session.revision + 1,
    clock: { ...projected, offsetChars }
  };
}

export function toEnvelope(session, command, sentAt) {
  return {
    sessionId: session.id,
    revision: session.revision,
    status: session.status,
    playing: session.clock.playing,
    speed: session.clock.speed,
    offsetChars: session.clock.offsetChars,
    updatedAt: session.clock.updatedAt,
    loop: session.clock.loop,
    snapshotBody: session.snapshotBody,
    command,
    sentAt
  };
}
