import { paintPrompter } from './paint.js';
import { bootStudio } from './entry.js';
import { scriptFromStoredJson } from '../library/script-json.js';
import { MemoryScriptRepository } from '../library/memory-repository.js';
import { JOIN_REJECTED_TEXT } from '../domain/passcode.js';

const shell = document.querySelector('#shell');
const library = document.querySelector('#library');
const editor = document.querySelector('#editor');
const outline = document.querySelector('#outline');
const canvas = document.querySelector('#prompter');
const heading = document.querySelector('#heading');
const status = document.querySelector('#status');
const back = document.querySelector('#back');
const pauseButton = document.querySelector('#pause');
const speedLabel = document.querySelector('#speed');
const passcode = document.querySelector('#passcode');
const joinInput = document.querySelector('#join-code');
const cue = document.querySelector('#cue-meta');
const fileHint = document.querySelector('#file-hint');

let studio = null;
let librarySignature = '';
let outlineSignature = '';
let remoteLibrary = false;

function now() {
  return Date.now();
}

function fitCanvas() {
  const pane = canvas.parentElement;
  const rect = pane.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(2, Math.floor(rect.width * dpr));
  const height = Math.max(2, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function paint() {
  if (!studio || studio.screen !== 'stage') return;
  if (studio.layoutKind() === 'directorOnly') return;
  fitCanvas();
  const clock = studio.clock();
  paintPrompter(canvas, studio.body(), clock ? clock.offsetChars : 0, studio.display);
}

async function persist(script) {
  if (!remoteLibrary || !script) return;
  try {
    await fetch(`/api/scripts/${encodeURIComponent(script.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: script.id, title: script.title, body: script.body, updatedAt: script.updatedAt })
    });
  } catch {
    remoteLibrary = false;
  }
}

async function persistDelete(id) {
  if (!remoteLibrary) return;
  await fetch(`/api/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

function renderLibrary() {
  const items = studio.list();
  const signature = items.map((item) => `${item.id}:${item.title}:${item.updatedAt}`).join('|');
  if (signature === librarySignature && library.childElementCount > 0) return;
  librarySignature = signature;
  library.replaceChildren();
  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'card';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'card';
    open.dataset.open = item.id;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = '打开提词';
    open.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.delete = item.id;
    remove.textContent = '删除';
    actions.append(remove);
    card.append(open, actions);
    library.append(card);
  }
  const create = document.createElement('button');
  create.id = 'new-script';
  create.type = 'button';
  create.textContent = '新建讲稿';
  library.append(create);
}

function renderOutline() {
  const headings = studio.headings();
  const signature = headings.join('\n');
  if (signature === outlineSignature) return;
  outlineSignature = signature;
  outline.replaceChildren();
  for (const title of headings) {
    const item = document.createElement('li');
    item.dataset.heading = title;
    item.textContent = title;
    outline.append(item);
  }
}

function renderChrome() {
  const clock = studio.clock();
  const onStage = studio.screen === 'stage';
  shell.dataset.screen = studio.screen;
  shell.dataset.layout = onStage ? studio.layoutKind() : 'splitHorizontal';
  shell.dataset.role = studio.role;
  shell.dataset.offset = String(clock ? clock.offsetChars : 0);
  shell.dataset.playing = clock && clock.playing ? 'true' : 'false';
  shell.dataset.locked = studio.lock.locked ? 'true' : 'false';
  back.hidden = !onStage;
  heading.textContent = onStage ? (studio.title() || '提词') : '讲稿库';
  status.textContent = studio.joinMessage || (clock ? `${clock.offsetChars} 字` : '');
  if (clock) {
    speedLabel.textContent = `${clock.speed.toFixed(1)}×`;
    speedLabel.dataset.speed = String(clock.speed);
    pauseButton.textContent = clock.playing ? '暂停' : '开始';
    pauseButton.dataset.playing = clock.playing ? 'true' : 'false';
    cue.textContent = clock.playing ? '滚动中' : '已暂停';
  }
  passcode.textContent = studio.passcodeText;
  passcode.dataset.passcode = studio.authority?.joinTicket?.code ?? '';
  if (onStage && document.activeElement !== editor && editor.value !== studio.body()) {
    editor.value = studio.body();
  }
  renderLibrary();
  if (onStage) renderOutline();
  paint();
}

function currentMode(target) {
  if (!target) return 'direct';
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return 'edit';
  return 'direct';
}

async function bootFromNetwork() {
  const repo = new MemoryScriptRepository();
  try {
    const response = await fetch('/api/scripts');
    if (!response.ok) throw new Error('library');
    remoteLibrary = true;
    const payload = await response.json();
    for (const item of payload.scripts ?? []) {
      const parsed = scriptFromStoredJson(JSON.stringify(item));
      if (parsed) repo.save(parsed);
    }
  } catch {
    remoteLibrary = false;
  }
  const known = new Set(repo.list().map((item) => item.id));
  studio = bootStudio(repo, { now: now(), width: window.innerWidth, height: window.innerHeight });
  for (const item of studio.list()) {
    if (!known.has(item.id)) await persist(repo.load(item.id));
  }
  renderChrome();
  requestAnimationFrame(() => {
    if (!studio) return;
    studio.setViewport(window.innerWidth, window.innerHeight);
    renderChrome();
  });
}

function bind() {
  window.addEventListener('resize', () => {
    if (!studio) return;
    studio.setViewport(window.innerWidth, window.innerHeight);
    renderChrome();
  });

  library.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete]');
    if (remove) {
      const id = remove.dataset.delete;
      studio.delete(id);
      await persistDelete(id);
      renderChrome();
      return;
    }
    if (event.target.closest('#new-script')) {
      const script = studio.create('未命名讲稿', '## 开场\n\n', now());
      await persist(script);
      studio.open(script.id, now());
      editor.value = studio.body();
      outlineSignature = '';
      renderChrome();
      return;
    }
    const open = event.target.closest('[data-open]');
    if (!open) return;
    studio.open(open.dataset.open, now());
    editor.value = studio.body();
    outlineSignature = '';
    renderChrome();
  });

  back.addEventListener('click', () => {
    studio.back();
    renderChrome();
  });

  editor.addEventListener('input', async () => {
    const saved = studio.editBody(editor.value, now());
    if (saved && saved.ok) await persist(saved.script);
    outlineSignature = '';
    renderChrome();
  });

  document.querySelector('#transport').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || studio.screen !== 'stage') return;
    const action = button.dataset.action;
    const at = now();
    if (action === 'pause') studio.togglePause(at);
    if (action === 'slower') studio.nudge(-1, at);
    if (action === 'faster') studio.nudge(1, at);
    if (action === 'prev') studio.step(-1, at);
    if (action === 'next') studio.step(1, at);
    if (action === 'theme') studio.cycleTheme();
    if (action === 'mirror-h') studio.toggleMirrorH();
    if (action === 'mirror-v') studio.toggleMirrorV();
    if (action === 'mint') {
      const minted = studio.mintPasscode(at);
      if (minted.ok) await publishLobby(minted.code, at);
    }
    if (action === 'join') await joinTyped(at);
    if (action === 'drop') studio.dropLink();
    renderChrome();
  });

  window.addEventListener('keydown', (event) => {
    if (!studio || studio.screen !== 'stage') return;
    const mode = currentMode(event.target);
    if (event.target.tagName === 'BUTTON') return;
    let stroke = null;
    if (event.key === ' ') stroke = { key: 'space' };
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') stroke = { key: 'previous' };
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') stroke = { key: 'next' };
    else if (/^[0-9]$/.test(event.key)) stroke = { key: 'digit', digit: Number(event.key) };
    if (!stroke) return;
    if (mode === 'direct') event.preventDefault();
    studio.handleStroke(mode, stroke, now());
    renderChrome();
  });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    studio.pointerDown(now());
  });
  canvas.addEventListener('pointerup', () => {
    studio.pointerUp(now());
    renderChrome();
  });
  canvas.addEventListener('wheel', (event) => {
    if (studio.screen !== 'stage') return;
    event.preventDefault();
    const notches = event.deltaY === 0 ? 0 : (event.deltaY > 0 ? 1 : -1);
    studio.handleStroke('direct', { key: 'wheel', notches }, now());
    renderChrome();
  }, { passive: false });

  window.setInterval(() => {
    if (!studio || studio.screen !== 'stage') return;
    const at = now();
    if (studio.following()) {
      if (studio.authority) studio.followAuthority(at);
      else {
        studio.project(at);
        pullLobby();
      }
    } else {
      const clock = studio.project(at);
      if (remoteLibrary && studio.authority && clock) publishClock(clock);
    }
    renderChrome();
  }, 200);
}

async function pullLobby() {
  if (!remoteLibrary || !studio || !studio.following()) return;
  try {
    const response = await fetch('/api/lobby/state');
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.envelope) studio.applyFollowEnvelope(payload.envelope);
    renderChrome();
  } catch {
    remoteLibrary = false;
  }
}

async function publishLobby(code, at) {
  if (!remoteLibrary) return;
  const clock = studio.clock();
  await fetch('/api/lobby', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: studio.authority.id,
      scriptId: studio.scriptId,
      body: studio.body(),
      code,
      now: at,
      offsetChars: clock.offsetChars,
      speed: clock.speed,
      playing: clock.playing,
      loop: clock.loop,
      updatedAt: clock.updatedAt
    })
  });
}

async function publishClock(clock) {
  if (!studio.authority?.joinTicket) return;
  await fetch('/api/lobby/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      offsetChars: clock.offsetChars,
      speed: clock.speed,
      playing: clock.playing,
      loop: clock.loop,
      updatedAt: clock.updatedAt,
      body: studio.body()
    })
  }).catch(() => {});
}

async function joinTyped(at) {
  const code = joinInput.value;
  if (remoteLibrary) {
    const response = await fetch('/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, now: at, deviceName: 'windows' })
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload.ok && payload.envelope) {
        studio.adoptFollower(payload.envelope);
        return;
      }
      if (!studio.authority) {
        studio.joinMessage = JOIN_REJECTED_TEXT;
        return;
      }
    }
  }
  const local = studio.joinPasscode(code, at);
  if (!local.ok && !studio.joinMessage) studio.joinMessage = JOIN_REJECTED_TEXT;
}

if (location.protocol === 'file:') {
  fileHint.hidden = false;
  library.hidden = true;
} else {
  bootFromNetwork().then(() => bind());
}
