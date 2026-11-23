import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MemoryScriptRepository } from '../src/library/memory-repository.js';
import { createLobbyHub } from '../src/net/lobby-hub.js';
import { bootStudio } from '../src/ui/entry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TITLES = ['3 分钟自我介绍', '8 分钟答辩', '20 分钟网课节导', '60 秒招新'];

function studio(width, height) {
  return bootStudio(new MemoryScriptRepository(), { now: 5000, width, height, ids: (() => {
    let n = 0;
    return () => `e${++n}`;
  })() });
}

test('the windows entry boots the four templates and the defense headings', () => {
  const app = studio(1200, 800);
  assert.deepEqual(app.list().map((item) => item.title).sort(), [...TITLES].sort());
  assert.equal(app.openByTitle('8 分钟答辩', 5000).ok, true);
  assert.deepEqual(app.headings(), ['选题', '方法', '结果', '创新点']);
  assert.equal(app.layoutKind(), 'splitHorizontal');
  const left = [];
  const right = [];
  app.subscribe((session) => left.push(session.clock.offsetChars));
  app.subscribe((session) => right.push(session.clock.offsetChars));
  app.togglePause(5000);
  app.project(6500);
  app.togglePause(6500);
  const frozen = app.clock().offsetChars;
  assert.ok(frozen > 0);
  assert.equal(app.clock().playing, false);
  app.project(9000);
  assert.equal(app.clock().offsetChars, frozen);
  assert.equal(left.at(-1), right.at(-1));
  app.editBody(`${app.body()}\n补一句`, 9000);
  assert.equal(app.clock().offsetChars, frozen);
  assert.notEqual(app.clock().offsetChars, 0);
  app.handleStroke('edit', { key: 'space' }, 9100);
  assert.equal(app.clock().playing, false);
  assert.equal(app.clock().offsetChars, frozen);
  app.handleStroke('direct', { key: 'space' }, 9100);
  assert.equal(app.clock().playing, true);
  app.togglePause(9100);
  assert.equal(app.clock().playing, false);
  app.handleStroke('direct', { key: 'digit', digit: 3 }, 9100);
  assert.equal(app.clock().offsetChars, app.anchors()[2].offsetChars);
  assert.equal(app.anchors()[2].title, '结果');
  app.setViewport(500, 800);
  assert.equal(app.layoutKind(), 'fullPrompt');
  app.setViewport(700, 900);
  assert.equal(app.layoutKind(), 'splitVertical');
  app.setRemotePrompter(true);
  app.setViewport(1200, 800);
  assert.equal(app.layoutKind(), 'directorOnly');
});

test('gesture, mirror, and theme controls on the entry affect the same session', () => {
  const app = studio(1100, 700);
  app.openByTitle('60 秒招新', 1000);
  assert.equal(app.pointerUp(1000).togglePause, false);
  assert.equal(app.clock().playing, false);
  app.pointerDown(1000);
  const held = app.pointerUp(2000);
  assert.equal(held.lock.locked, false);
  app.pointerDown(2100);
  assert.equal(app.pointerUp(2200).togglePause, true);
  assert.equal(app.clock().playing, true);
  assert.equal(app.toggleMirrorH().mirrorH, true);
  assert.equal(app.toggleMirrorH().mirrorH, false);
  assert.equal(app.toggleMirrorV().mirrorV, true);
  assert.equal(app.toggleMirrorV().mirrorV, false);
  assert.equal(app.cycleTheme().theme, 'light');
  assert.equal(app.cycleTheme().theme, 'amber');
  assert.equal(app.cycleTheme().theme, 'dark');
});

test('the entry mints a ten minute code and a prompter command leaves the offset', () => {
  const app = studio(1000, 700);
  app.openByTitle('8 分钟答辩', 1000);
  app.togglePause(1000);
  app.project(3000);
  const minted = app.mintPasscode(3000, () => 0.13579);
  assert.equal(minted.ok, true);
  assert.equal(minted.code, '135790');
  assert.equal(minted.expiresAt - 3000, 600000);
  const offset = app.clock().offsetChars;
  assert.ok(offset > 0);
  assert.equal(app.joinPasscode('000000', 3000).ok, false);
  assert.equal(app.joinPasscode('135790', 3000 + 600000).ok, false);
  const joined = app.joinPasscode('135790', 3200);
  assert.equal(joined.ok, true);
  assert.equal(joined.offsetChars, offset);
  assert.equal(joined.snapshotBody.includes('## 选题'), true);
  const blocked = app.prompterCommand('pause', 3300);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.offsetChars, offset);
  const dropped = app.dropLink();
  assert.ok(dropped.offsetChars >= offset);
  assert.notEqual(dropped.offsetChars, 0);
  assert.equal(dropped.status, 'degraded');
  assert.equal(app.role, 'solo');
  if (app.clock().playing) app.togglePause(3300);
  const frozen = app.clock().offsetChars;
  assert.equal(app.clock().playing, false);
  app.project(4300);
  assert.equal(app.clock().offsetChars, frozen);
  app.togglePause(4300);
  app.project(5300);
  assert.ok(app.clock().offsetChars > frozen);
});

test('a joiner follows the director clock and a prompter pause does not move it', () => {
  const director = studio(1100, 700);
  director.openByTitle('8 分钟答辩', 1000);
  director.togglePause(1000);
  director.project(3000);
  const minted = director.mintPasscode(3000, () => 0.13579);
  const clock = director.clock();
  const hub = createLobbyHub();
  const hosted = hub.host({
    id: 'lobby',
    scriptId: 'defense',
    body: director.body(),
    code: minted.code,
    now: 3000,
    offsetChars: clock.offsetChars,
    playing: clock.playing,
    speed: clock.speed,
    loop: clock.loop,
    updatedAt: clock.updatedAt
  });
  assert.equal(hosted.ok, true);
  const joined = hub.join({ code: minted.code, now: 3000, deviceName: 'phone' });
  assert.equal(joined.ok, true);
  assert.equal(joined.envelope.offsetChars, clock.offsetChars);
  director.project(5000);
  const later = director.clock();
  hub.updateClock({
    body: director.body(),
    offsetChars: later.offsetChars,
    playing: later.playing,
    speed: later.speed,
    loop: later.loop,
    updatedAt: later.updatedAt
  });
  const snap = hub.snapshot(5000);
  assert.ok(snap.offsetChars > joined.envelope.offsetChars);
  assert.equal(snap.offsetChars, later.offsetChars);
  assert.equal(snap.playing, true);
  const denied = hub.command({ role: 'prompter', command: 'pause', now: 5000 });
  assert.equal(denied.ok, false);
  assert.equal(hub.snapshot(5000).offsetChars, snap.offsetChars);
  const joiner = studio(420, 800);
  joiner.adoptFollower(joined.envelope);
  assert.equal(joiner.clock().offsetChars, joined.envelope.offsetChars);
  joiner.applyFollowEnvelope(snap);
  assert.equal(joiner.clock().offsetChars, snap.offsetChars);
  assert.equal(joiner.clock().playing, true);
  const blocked = joiner.prompterCommand('pause', 5000);
  assert.equal(blocked.ok, false);
  assert.equal(joiner.clock().offsetChars, snap.offsetChars);
  const dropped = joiner.dropLink();
  assert.equal(dropped.offsetChars, snap.offsetChars);
  assert.notEqual(dropped.offsetChars, 0);
  assert.equal(joiner.role, 'solo');
  joiner.togglePause(5000);
  assert.equal(joiner.clock().playing, false);
  assert.equal(joiner.clock().offsetChars, snap.offsetChars);
  joiner.togglePause(5000);
  joiner.project(6000);
  assert.ok(joiner.clock().offsetChars > snap.offsetChars);
});

test('the page script does not depend on node module loaders', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = readFileSync(path.join(root, 'src', 'ui', 'app.js'), 'utf8');
  const paint = readFileSync(path.join(root, 'src', 'ui', 'paint.js'), 'utf8');
  assert.match(html, /type="module"/);
  assert.match(html, /<script>\s*if \(location\.protocol === "file:"\)/);
  assert.match(html, /file-hint/);
  assert.match(html, /npm start/);
  assert.match(app, /\/api\/lobby\/state/);
  assert.match(app, /applyFollowEnvelope/);
  for (const source of [html, app, paint]) {
    assert.equal(source.includes('require('), false);
    assert.equal(source.includes('module.exports'), false);
  }
});
