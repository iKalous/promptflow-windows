import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { align } from '../src/domain/align.js';
import { parseAnchors } from '../src/domain/anchors.js';
import { stepAnchor } from '../src/domain/anchor-step.js';
import { applyAuthorityCommand } from '../src/domain/authority.js';
import { nudgeSpeed, pause, project, resume, setSpeed } from '../src/domain/clock.js';
import { applyStroke, emptyChord } from '../src/domain/direct-keys.js';
import { cycleTheme, defaultDisplay, themeColors, toggleMirrorH, toggleMirrorV } from '../src/domain/display.js';
import { defaultLock, longPress, tap } from '../src/domain/gesture-lock.js';
import { chooseLayout } from '../src/domain/layout.js';
import { acceptTcpJoin, joinLine, parseJoinResult } from '../src/domain/messages.js';
import { checkJoin, openLobby, startScrolling } from '../src/domain/lobby.js';
import { PASS_MS, randomPasscode } from '../src/domain/passcode.js';
import { dropFollower, followerFromEnvelope } from '../src/domain/loss.js';
import { LocalLoopbackPort } from '../src/domain/loopback.js';
import { pushSnapshot, toEnvelope } from '../src/domain/push-snapshot.js';
import { startSolo } from '../src/domain/session.js';
import { LiveSession } from '../src/domain/live-session.js';
import { FileScriptRepository } from '../src/library/file-repository.js';
import { MemoryScriptRepository } from '../src/library/memory-repository.js';
import { createScript } from '../src/library/script-library.js';
import { TEMPLATES, createFromTemplate, templateBody } from '../src/library/templates.js';

function clock(partial = {}) {
  return { playing: true, speed: 1, offsetChars: 0, updatedAt: 0, loop: false, ...partial };
}

test('headings become anchors at the character offset of each marker', () => {
  const spec = TEMPLATES.find((item) => item.id === 'defense-8m');
  const body = templateBody(spec);
  const anchors = parseAnchors(body);
  assert.deepEqual(anchors.map((anchor) => anchor.title), ['选题', '方法', '结果', '创新点']);
  assert.deepEqual(anchors.map((anchor) => anchor.level), [2, 2, 2, 2]);
  for (const anchor of anchors) {
    assert.equal(anchor.offsetChars, body.indexOf(`## ${anchor.title}`));
  }
});

test('the clock advances four characters per second and clamps speed by tenths', () => {
  assert.equal(project(clock(), 1000, 100).offsetChars, 4);
  assert.equal(project(clock({ speed: 2 }), 1000, 100).offsetChars, 8);
  assert.equal(setSpeed(clock(), 0.44, 0, 100).speed, 0.5);
  assert.equal(setSpeed(clock(), 3.24, 0, 100).speed, 3);
  assert.equal(nudgeSpeed(clock({ speed: 1 }), 1, 0, 100).speed, 1.1);
  assert.equal(nudgeSpeed(clock({ speed: 3 }), 1, 0, 100).speed, 3);
  assert.equal(nudgeSpeed(clock({ speed: 0.5 }), -1, 0, 100).speed, 0.5);
});

test('pause keeps the offset, the end stops, and loop wraps instead of stopping', () => {
  const running = project(clock(), 1000, 100);
  const paused = pause(running, 1000, 100);
  assert.equal(paused.playing, false);
  assert.equal(paused.offsetChars, 4);
  assert.equal(project(paused, 9000, 100).offsetChars, 4);
  assert.equal(project(paused, 9000, 100).playing, false);
  const ended = project(clock(), 1000, 4);
  assert.equal(ended.playing, false);
  assert.equal(ended.offsetChars, 4);
  assert.equal(ended.loop, false);
  assert.equal(resume(ended, 2000, 4).playing, false);
  const wrapped = project(clock({ loop: true }), 1500, 4);
  assert.equal(wrapped.playing, true);
  assert.equal(wrapped.offsetChars, 2);
});

test('jump lands on an anchor and a revised script keeps the live offset', () => {
  const body = templateBody(TEMPLATES[1]);
  let session = startSolo('s', 'script', body, 0);
  session = { ...session, clock: project(session.clock, 2000, session.snapshotBody.length) };
  const before = session.clock.offsetChars;
  assert.ok(before > 0);
  const jumped = new LiveSession(session).jumpIndex(2, 2000);
  assert.equal(jumped.clock.offsetChars, session.anchors[1].offsetChars);
  assert.equal(session.anchors[1].title, '方法');
  const stepped = stepAnchor(session.anchors, jumped.clock.offsetChars, 1);
  assert.equal(stepped, session.anchors[2].offsetChars);
  const revised = pushSnapshot(session, `${body}补一句说明\n`, 2000);
  assert.equal(revised.clock.offsetChars, before);
  assert.notEqual(revised.clock.offsetChars, 0);
  assert.equal(revised.clock.offsetChars, align(session.anchors, before, revised.anchors, revised.snapshotBody.length));
});

test('split subscribers share one clock', () => {
  const live = new LiveSession(startSolo('s', 'script', '大家好，这是一段足够长的讲稿。', 0));
  const seen = [[], []];
  live.subscribe((session) => seen[0].push(session.clock));
  live.subscribe((session) => seen[1].push(session.clock));
  live.project(1000);
  live.togglePause(1000);
  assert.equal(seen[0].at(-1), seen[1].at(-1));
  assert.equal(seen[0].at(-1).offsetChars, 4);
  assert.equal(seen[0].at(-1).playing, false);
});

test('layout follows role, width, and a connected remote prompter', () => {
  assert.equal(chooseLayout('prompter', 1200, 900, false), 'fullPrompt');
  assert.equal(chooseLayout('solo', 599, 1000, false), 'fullPrompt');
  assert.equal(chooseLayout('solo', 1200, 900, true), 'directorOnly');
  assert.equal(chooseLayout('solo', 840, 700, false), 'splitHorizontal');
  assert.equal(chooseLayout('solo', 700, 900, false), 'splitVertical');
  assert.equal(chooseLayout('solo', 700, 899, false), 'directorOnly');
  assert.equal(chooseLayout('director', 1200, 900, false), 'directorOnly');
});

test('editor space does nothing while director keys pause, jump, and nudge', () => {
  const held = { ctrl: true, digits: '1' };
  assert.equal(applyStroke('edit', held, { key: 'space' }, 4).action.kind, 'none');
  assert.equal(applyStroke('edit', held, { key: 'space' }, 4).chord, held);
  assert.equal(applyStroke('direct', emptyChord(), { key: 'space' }, 4).action.kind, 'togglePause');
  assert.deepEqual(applyStroke('direct', emptyChord(), { key: 'previous' }, 4).action, { kind: 'step', direction: -1 });
  assert.deepEqual(applyStroke('direct', emptyChord(), { key: 'next' }, 4).action, { kind: 'step', direction: 1 });
  assert.deepEqual(applyStroke('direct', emptyChord(), { key: 'wheel', notches: -1 }, 4).action, { kind: 'nudge', notches: -1 });
  assert.deepEqual(applyStroke('direct', emptyChord(), { key: 'digit', digit: 2 }, 4).action, { kind: 'jump', index: 2 });
  assert.equal(applyStroke('direct', emptyChord(), { key: 'digit', digit: 9 }, 4).action.kind, 'none');
});

test('gesture lock starts locked, ignores a short tap, and opens on a one second hold', () => {
  const locked = defaultLock();
  assert.equal(locked.locked, true);
  assert.equal(tap(locked, 1000).togglePause, false);
  assert.equal(longPress(locked, 999, 1000).locked, true);
  const open = longPress(locked, 1000, 1000);
  assert.equal(open.locked, false);
  assert.equal(tap(open, 1000).togglePause, true);
});

test('mirror toggles return on the second press and theme has dark, light, and amber', () => {
  const onceH = toggleMirrorH(defaultDisplay());
  assert.equal(onceH.mirrorH, true);
  assert.equal(toggleMirrorH(onceH).mirrorH, false);
  const onceV = toggleMirrorV(defaultDisplay());
  assert.equal(onceV.mirrorV, true);
  assert.equal(onceV.mirrorH, false);
  assert.equal(toggleMirrorV(onceV).mirrorV, false);
  const light = cycleTheme(defaultDisplay());
  const amber = cycleTheme(light);
  assert.equal(light.theme, 'light');
  assert.equal(amber.theme, 'amber');
  assert.equal(cycleTheme(amber).theme, 'dark');
  assert.equal(themeColors('dark').background, '#000000');
  assert.equal(themeColors('light').background, '#FFFFFF');
  assert.equal(themeColors('amber').background, '#F6C445');
});

test('templates copy into the library and leave the built-in wording untouched', () => {
  const repo = new MemoryScriptRepository();
  let n = 0;
  const ids = () => `id${++n}`;
  const original = TEMPLATES.map((spec) => ({ title: spec.title, body: templateBody(spec), headings: [...spec.headings] }));
  const first = createFromTemplate('defense-8m', 10, ids, repo);
  const second = createFromTemplate('defense-8m', 11, ids, repo);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.script.id, second.script.id);
  const edited = { ...first.script, body: '改过的正文' };
  repo.save(edited);
  assert.equal(repo.load(first.script.id).body, '改过的正文');
  TEMPLATES.forEach((spec, index) => {
    assert.equal(spec.title, original[index].title);
    assert.equal(templateBody(spec), original[index].body);
    assert.deepEqual(spec.headings, original[index].headings);
  });
  assert.equal(createFromTemplate('missing', 12, ids, repo).ok, false);
});

test('a file library creates, edits, lists, and deletes across a new process store', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'promptflow-'));
  try {
    const first = new FileScriptRepository(directory);
    const script = createScript('排练', '## 开场\n\n你好', 20, () => 'kept', first);
    const edited = createScript('排练', '## 开场\n\n你好，改了', 21, () => 'kept2', first);
    assert.equal(edited.id, 'kept2');
    const reopened = new FileScriptRepository(directory);
    assert.equal(reopened.load(script.id).body, '## 开场\n\n你好');
    assert.equal(reopened.load('kept2').body.includes('改了'), true);
    assert.equal(reopened.list().some((item) => item.title === '排练'), true);
    assert.deepEqual(reopened.remove('kept'), { ok: true });
    const afterDelete = new FileScriptRepository(directory);
    assert.equal(afterDelete.load('kept'), null);
    assert.equal(afterDelete.load('kept2').title, '排练');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a passcode lasts ten minutes, a joiner receives the offset, and a prompter cannot move it', () => {
  assert.equal(PASS_MS, 600000);
  assert.equal(randomPasscode(() => 0), '000000');
  assert.equal(randomPasscode(() => 1), '999999');
  const opened = openLobby(null, 'lobby', 'script', templateBody(TEMPLATES[1]), '246810', 1000);
  assert.equal(opened.ok, true);
  assert.equal(opened.session.joinTicket.expiresAt, 1000 + PASS_MS);
  let authority = startScrolling(opened.session, 1000).session;
  authority = {
    ...authority,
    clock: project(authority.clock, 3000, authority.snapshotBody.length)
  };
  const offset = authority.clock.offsetChars;
  assert.ok(offset > 0);
  assert.equal(checkJoin(authority, '000000', 2000).ok, false);
  assert.equal(checkJoin(authority, '246810', 1000 + PASS_MS).code, 'joinRejected');
  const joined = acceptTcpJoin(authority, joinLine('246 810', 'phone'), 2000);
  assert.equal(joined.ok, true);
  const parsed = parseJoinResult(joined.line);
  assert.equal(parsed.kind, 'envelope');
  assert.equal(parsed.envelope.snapshotBody, joined.session.snapshotBody);
  assert.equal(parsed.envelope.offsetChars, offset);
  const follower = followerFromEnvelope(parsed.envelope);
  assert.equal(follower.clock.offsetChars, offset);
  const port = new LocalLoopbackPort();
  let delivered = 0;
  port.subscribe(() => { delivered += 1; });
  const rejected = port.publish('prompter', toEnvelope(joined.session, 'pause', 4000));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'readOnlyRole');
  assert.equal(delivered, 0);
  const command = applyAuthorityCommand(joined.session, 'prompter', 'pause', 4000);
  assert.equal(command.ok, false);
  assert.equal(command.session.clock.offsetChars, offset);
  assert.equal(command.session, joined.session);
  const dropped = dropFollower(follower);
  assert.equal(dropped.offsetChars, offset);
  assert.notEqual(dropped.offsetChars, 0);
  assert.equal(dropped.session.status, 'degraded');
  assert.equal(dropped.session.clock.offsetChars, follower.clock.offsetChars);
});
