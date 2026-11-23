import { project } from './clock.js';
import { parseAnchors } from './anchors.js';
import { offsetAfterEnvelope } from './apply-offset.js';
import { applyLinkLost } from './session.js';

export const LINK_LOST_BAR = '已单机，提词仍可滚';
export const MIRROR_SILENCE_MS = 4000;
export const PULSE_INTERVAL_MS = 1000;

export function sessionAfterSend(session, pipe) {
  if (session.prompterJoined !== true) return { session, republish: false };
  if (pipe === 'none') return { session: applyLinkLost(session), republish: false };
  if (session.status !== 'degraded') return { session, republish: false };
  return { session: { ...session, status: 'live' }, republish: true };
}

export function mirrorStatus(status, lastHeardAt, now) {
  if (status !== 'live') return status;
  if (now - lastHeardAt < MIRROR_SILENCE_MS) return status;
  return 'degraded';
}

export function takeEnvelope(applied, seenRevision, nextRevision, localStatus, envelopeStatus) {
  if (applied && nextRevision < seenRevision) return 'drop';
  if (applied && nextRevision === seenRevision) {
    if (localStatus === 'degraded' && envelopeStatus === 'live') return 'apply';
    return 'hear';
  }
  return 'apply';
}

function offsetCommand(command) {
  if (command === 'jumpAnchor' || command === 'pushSnapshot') return command;
  return null;
}

function jumpOffsetFor(command, envelopeOffset, anchors) {
  if (command !== 'jumpAnchor') return null;
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    if (anchor !== undefined && anchor.offsetChars === envelopeOffset) return envelopeOffset;
  }
  return null;
}

export function mirrorOffset(input) {
  const newAnchors = parseAnchors(input.envelope.snapshotBody);
  return offsetAfterEnvelope({
    wasDegraded: input.wasDegraded,
    command: offsetCommand(input.envelope.command),
    localOffset: input.localOffset,
    envelopeOffset: input.envelope.offsetChars,
    jumpOffset: jumpOffsetFor(input.envelope.command, input.envelope.offsetChars, newAnchors),
    oldAnchors: input.oldAnchors,
    newAnchors,
    newLength: input.envelope.snapshotBody.length
  });
}

export function clockAfterEnvelope(input) {
  const local = project(input.localClock, input.now, input.bodyLength);
  const offsetChars = mirrorOffset({
    wasDegraded: input.wasDegraded,
    localOffset: local.offsetChars,
    oldAnchors: input.oldAnchors,
    envelope: input.envelope
  });
  return {
    playing: input.envelope.playing,
    speed: input.envelope.speed,
    offsetChars,
    updatedAt: input.wasDegraded === true ? input.now : input.envelope.updatedAt,
    loop: input.envelope.loop
  };
}

export function lampFill(status) {
  if (status === 'live') return '#3D7A5A';
  if (status === 'degraded') return '#C6A15B';
  if (status === 'idle') return '#9C9A92';
  return '#8EA0B3';
}

export function barText(status) {
  if (status === 'degraded') return LINK_LOST_BAR;
  return '';
}

export function statusLabel(status) {
  if (status === 'idle') return '等待提词端';
  if (status === 'live') return '已连接';
  if (status === 'degraded') return '已单机';
  return '已结束';
}

export function followerFromEnvelope(envelope) {
  const snapshotBody = envelope.snapshotBody;
  return {
    id: envelope.sessionId,
    scriptId: envelope.sessionId,
    role: 'prompter',
    status: 'live',
    revision: envelope.revision,
    snapshotBody,
    anchors: parseAnchors(snapshotBody),
    clock: {
      playing: envelope.playing,
      speed: envelope.speed,
      offsetChars: envelope.offsetChars,
      updatedAt: envelope.updatedAt,
      loop: envelope.loop
    },
    joinTicket: null,
    prompterJoined: false
  };
}

export function dropFollower(follower) {
  const lost = applyLinkLost(follower);
  return {
    session: lost,
    offsetChars: lost.clock.offsetChars
  };
}
