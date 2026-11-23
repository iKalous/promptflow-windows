import { nudgeSpeed, pause, project, resume, setLoop, setSpeed } from './clock.js';
import { stepAnchor } from './anchor-step.js';
import { pushSnapshot } from './push-snapshot.js';

export class LiveSession {
  constructor(session) {
    this.session = session;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.session);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.session);
  }

  replace(session) {
    this.session = session;
    this.emit();
    return this.session;
  }

  project(now) {
    const clock = project(this.session.clock, now, this.session.snapshotBody.length);
    return this.replace({ ...this.session, clock });
  }

  togglePause(now) {
    const length = this.session.snapshotBody.length;
    const clock = this.session.clock.playing
      ? pause(this.session.clock, now, length)
      : resume(this.session.clock, now, length);
    return this.replace({ ...this.session, clock });
  }

  edit(body, now) {
    return this.replace(pushSnapshot(this.session, body, now));
  }

  jumpIndex(index, now) {
    const anchor = this.session.anchors[index - 1];
    if (!anchor) return this.session;
    const projected = project(this.session.clock, now, this.session.snapshotBody.length);
    return this.replace({
      ...this.session,
      clock: { ...projected, offsetChars: anchor.offsetChars, updatedAt: now }
    });
  }

  step(direction, now) {
    const projected = project(this.session.clock, now, this.session.snapshotBody.length);
    const at = stepAnchor(this.session.anchors, projected.offsetChars, direction);
    if (at === null) return this.replace({ ...this.session, clock: projected });
    return this.replace({
      ...this.session,
      clock: { ...projected, offsetChars: at, updatedAt: now }
    });
  }

  nudge(notches, now) {
    return this.replace({
      ...this.session,
      clock: nudgeSpeed(this.session.clock, notches, now, this.session.snapshotBody.length)
    });
  }

  applySpeed(speed, now) {
    return this.replace({
      ...this.session,
      clock: setSpeed(this.session.clock, speed, now, this.session.snapshotBody.length)
    });
  }

  applyLoop(loop, now) {
    return this.replace({
      ...this.session,
      clock: setLoop(this.session.clock, loop, now, this.session.snapshotBody.length)
    });
  }
}
