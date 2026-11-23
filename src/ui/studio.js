import { applyStroke, emptyChord } from '../domain/direct-keys.js';
import { defaultDisplay, cycleTheme, toggleMirrorH, toggleMirrorV } from '../domain/display.js';
import { defaultLock, longPress, tap } from '../domain/gesture-lock.js';
import { chooseLayout } from '../domain/layout.js';
import { LiveSession } from '../domain/live-session.js';
import { acceptTcpJoin, joinLine, parseJoinResult } from '../domain/messages.js';
import { openLobby } from '../domain/lobby.js';
import { applyAuthorityCommand } from '../domain/authority.js';
import { dropFollower, followerFromEnvelope } from '../domain/loss.js';
import { PASS_MS, formatPasscode, randomPasscode } from '../domain/passcode.js';
import { pause, project } from '../domain/clock.js';
import { startSolo } from '../domain/session.js';
import { toEnvelope } from '../domain/push-snapshot.js';
import { LocalLoopbackPort } from '../domain/loopback.js';
import { createScript, updateBody } from '../library/script-library.js';
import { ensureTemplates } from '../library/templates.js';

export function createIdFactory() {
  let n = 0;
  return () => `s${Date.now().toString(36)}${++n}`;
}

export function bootStudio(repo, options = {}) {
  const now = options.now ?? 0;
  const ids = options.ids ?? createIdFactory();
  ensureTemplates(repo, now, ids);
  return new Studio(repo, ids, options);
}

export class Studio {
  constructor(repo, ids, options) {
    this.repo = repo;
    this.ids = ids;
    this.screen = 'library';
    this.role = options.role ?? 'solo';
    this.width = options.width ?? 1280;
    this.height = options.height ?? 800;
    this.remotePrompter = false;
    this.live = null;
    this.scriptId = null;
    this.chord = emptyChord();
    this.display = defaultDisplay();
    this.lock = defaultLock();
    this.pointerDownAt = null;
    this.listeners = new Set();
    this.authority = null;
    this.follower = null;
    this.joinMessage = '';
    this.passcodeText = '';
    this.loopback = new LocalLoopbackPort();
  }

  list() {
    return this.repo.list();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return this.live ? this.live.session : null;
  }

  emit() {
    const session = this.snapshot();
    for (const listener of this.listeners) listener(session);
  }

  layoutKind() {
    return chooseLayout(this.role, this.width, this.height, this.remotePrompter);
  }

  setViewport(width, height) {
    this.width = width;
    this.height = height;
    this.emit();
  }

  setRole(role) {
    this.role = role;
    this.emit();
  }

  setRemotePrompter(connected) {
    this.remotePrompter = connected === true;
    this.emit();
  }

  clock() {
    return this.live ? this.live.session.clock : null;
  }

  body() {
    return this.live ? this.live.session.snapshotBody : '';
  }

  anchors() {
    return this.live ? this.live.session.anchors : [];
  }

  headings() {
    return this.anchors().map((anchor) => anchor.title);
  }

  title() {
    if (!this.scriptId) return '';
    return this.repo.load(this.scriptId)?.title ?? '';
  }

  open(id, now) {
    const script = this.repo.load(id);
    if (!script) return { ok: false, code: 'notFound' };
    const started = startSolo(`solo-${id}`, script.id, script.body, now);
    const clock = pause(started.clock, now, started.snapshotBody.length);
    this.live = new LiveSession({ ...started, clock });
    this.scriptId = id;
    this.screen = 'stage';
    this.role = 'solo';
    this.remotePrompter = false;
    this.chord = emptyChord();
    this.follower = null;
    this.emit();
    return { ok: true, script };
  }

  openByTitle(title, now) {
    const found = this.list().find((script) => script.title === title);
    if (!found) return { ok: false, code: 'notFound' };
    return this.open(found.id, now);
  }

  back() {
    this.screen = 'library';
    this.emit();
  }

  create(title, body, now) {
    const script = createScript(title, body, now, this.ids, this.repo);
    this.emit();
    return script;
  }

  delete(id) {
    const result = this.repo.remove(id);
    if (this.scriptId === id) {
      this.live = null;
      this.scriptId = null;
      this.screen = 'library';
    }
    this.emit();
    return result;
  }

  editBody(body, now) {
    if (this.role === 'prompter') return { ok: false, code: 'readOnlyRole' };
    if (!this.live || !this.scriptId) return { ok: false, code: 'notFound' };
    const saved = updateBody(this.scriptId, body, now, this.repo);
    if (!saved.ok) return saved;
    this.live.edit(saved.script.body, now);
    this.emit();
    return saved;
  }

  project(now) {
    if (!this.live) return null;
    this.live.project(now);
    this.emit();
    return this.clock();
  }

  togglePause(now) {
    if (!this.live) return null;
    if (this.role === 'prompter') return this.prompterCommand('pause', now);
    this.live.togglePause(now);
    this.emit();
    return this.clock();
  }

  nudge(notches, now) {
    if (!this.live || this.role === 'prompter') return this.clock();
    this.live.nudge(notches, now);
    this.emit();
    return this.clock();
  }

  step(direction, now) {
    if (!this.live || this.role === 'prompter') return this.clock();
    this.live.step(direction, now);
    this.emit();
    return this.clock();
  }

  jump(index, now) {
    if (!this.live || this.role === 'prompter') return this.clock();
    this.live.jumpIndex(index, now);
    this.emit();
    return this.clock();
  }

  setLoop(loop, now) {
    if (!this.live) return null;
    this.live.applyLoop(loop, now);
    this.emit();
    return this.clock();
  }

  handleStroke(mode, stroke, now) {
    const count = this.anchors().length;
    const result = applyStroke(mode, this.chord, stroke, count);
    this.chord = result.chord;
    if (!this.live || mode === 'edit') return result.action;
    if (this.role === 'prompter') {
      if (result.action.kind !== 'none') this.prompterCommand('pause', now);
      return result.action;
    }
    if (result.action.kind === 'togglePause') this.live.togglePause(now);
    if (result.action.kind === 'nudge') this.live.nudge(result.action.notches, now);
    if (result.action.kind === 'step') this.live.step(result.action.direction, now);
    if (result.action.kind === 'jump') this.live.jumpIndex(result.action.index, now);
    this.emit();
    return result.action;
  }

  pointerDown(now) {
    this.pointerDownAt = now;
  }

  pointerUp(now) {
    if (this.pointerDownAt === null) return { togglePause: false, lock: this.lock };
    const held = now - this.pointerDownAt;
    this.pointerDownAt = null;
    if (held >= 1000) {
      this.lock = longPress(this.lock, held, now);
      return { togglePause: false, lock: this.lock };
    }
    const result = tap(this.lock, now);
    this.lock = result.lock;
    if (result.togglePause && this.live && this.role !== 'prompter') this.live.togglePause(now);
    this.emit();
    return { togglePause: result.togglePause, lock: this.lock };
  }

  cycleTheme() {
    this.display = cycleTheme(this.display);
    this.emit();
    return this.display;
  }

  toggleMirrorH() {
    this.display = toggleMirrorH(this.display);
    this.emit();
    return this.display;
  }

  toggleMirrorV() {
    this.display = toggleMirrorV(this.display);
    this.emit();
    return this.display;
  }

  mintPasscode(now, random = Math.random) {
    if (!this.live) return { ok: false, code: 'notFound' };
    const code = randomPasscode(random);
    const opened = openLobby(null, `lobby-${this.scriptId}`, this.scriptId, this.live.session.snapshotBody, code, now);
    if (!opened.ok) return opened;
    const clock = this.live.session.clock;
    this.authority = {
      ...opened.session,
      status: 'idle',
      clock: { ...opened.session.clock, offsetChars: clock.offsetChars, speed: clock.speed, loop: clock.loop, playing: false }
    };
    this.passcodeText = formatPasscode(code);
    this.joinMessage = '';
    this.emit();
    return { ok: true, code, expiresAt: now + PASS_MS, text: this.passcodeText, session: this.authority };
  }

  joinPasscode(typed, now) {
    if (!this.authority) return { ok: false, code: 'joinRejected' };
    let preview = this.authority;
    if (this.live && this.role !== 'prompter') {
      const projected = project(this.live.session.clock, now, this.live.session.snapshotBody.length);
      preview = {
        ...this.authority,
        snapshotBody: this.live.session.snapshotBody,
        anchors: this.live.session.anchors,
        clock: projected
      };
    }
    const directorClock = preview.clock;
    const accepted = acceptTcpJoin(preview, joinLine(typed, 'windows'), now);
    if (!accepted.ok) {
      this.joinMessage = accepted.code === 'prompterOccupied' ? '这场已有提词屏' : '口令不正确或已过期';
      this.emit();
      return accepted;
    }
    this.authority = { ...accepted.session, clock: directorClock };
    const parsed = parseJoinResult(accepted.line);
    if (parsed.kind !== 'envelope') return { ok: false, code: 'joinRejected' };
    this.adoptFollower(parsed.envelope);
    this.followAuthority(now);
    return {
      ok: true,
      follower: this.follower,
      snapshotBody: this.body(),
      offsetChars: this.clock().offsetChars
    };
  }

  prompterCommand(command, now) {
    if (!this.authority) return { ok: false, code: 'readOnlyRole', session: this.live ? this.live.session : null };
    const before = this.authority.clock.offsetChars;
    const published = this.loopback.publish('prompter', toEnvelope(this.authority, command, now));
    const applied = applyAuthorityCommand(this.authority, 'prompter', command, now);
    this.joinMessage = '提词屏不能改稿';
    this.emit();
    return { ...applied, published, offsetChars: applied.session.clock.offsetChars, unchanged: applied.session.clock.offsetChars === before };
  }

  directorCommand(command, now) {
    if (!this.authority) return { ok: false, code: 'notFound' };
    const applied = applyAuthorityCommand(this.authority, 'director', command, now);
    if (applied.ok) this.authority = applied.session;
    return applied;
  }

  following() {
    return this.role === 'prompter' && this.follower !== null && this.follower.status !== 'degraded';
  }

  followAuthority(now) {
    if (!this.following() || !this.authority) return this.follower;
    const clock = project(this.authority.clock, now, this.authority.snapshotBody.length);
    this.authority = { ...this.authority, clock };
    return this.applyFollowEnvelope(toEnvelope(this.authority, null, now));
  }

  applyFollowEnvelope(envelope) {
    if (!this.follower || this.follower.status === 'degraded') return this.follower;
    this.follower = followerFromEnvelope(envelope);
    this.role = 'prompter';
    if (!this.live) this.live = new LiveSession(this.follower);
    else {
      this.live.replace({
        ...this.live.session,
        role: 'prompter',
        status: 'live',
        snapshotBody: this.follower.snapshotBody,
        anchors: this.follower.anchors,
        clock: { ...this.follower.clock }
      });
    }
    this.emit();
    return this.follower;
  }

  adoptFollower(envelope) {
    this.follower = followerFromEnvelope(envelope);
    this.role = 'prompter';
    this.remotePrompter = false;
    this.screen = 'stage';
    this.joinMessage = '';
    if (!this.live) this.live = new LiveSession(this.follower);
    else {
      this.live.replace({
        ...this.follower,
        scriptId: this.scriptId ?? this.follower.scriptId
      });
    }
    this.emit();
    return this.follower;
  }

  dropLink() {
    if (!this.follower) return null;
    const dropped = dropFollower(this.follower);
    this.follower = dropped.session;
    this.role = 'solo';
    if (this.live) {
      this.live.replace({
        ...this.live.session,
        role: 'solo',
        status: dropped.session.status,
        clock: { ...dropped.session.clock }
      });
    }
    this.joinMessage = '已单机，提词仍可滚';
    this.emit();
    return { offsetChars: dropped.offsetChars, status: dropped.session.status };
  }
}
