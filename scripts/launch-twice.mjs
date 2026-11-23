import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.SCRATCH;
if (!scratch) throw new Error('SCRATCH is required');
mkdirSync(scratch, { recursive: true });

const port = Number(process.env.PORT || 47321);
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
const base = `http://127.0.0.1:${port}`;
await waitForServer(base);

try {
  await runOnce(1);
  await runOnce(2);
} finally {
  server.kill();
}

async function runOnce(index) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => consoleLog.push(`pageerror: ${error.message}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  const titles = ['3 分钟自我介绍', '8 分钟答辩', '20 分钟网课节导', '60 秒招新'];
  for (const title of titles) {
    await page.getByText(title, { exact: true }).first().waitFor();
  }
  await page.screenshot({ path: path.join(scratch, `windows-launch-${index}-library.png`), fullPage: true });
  await page.getByRole('button', { name: /8 分钟答辩/ }).click();
  for (const heading of ['选题', '方法', '结果', '创新点']) {
    await page.locator('#outline').getByText(heading, { exact: true }).waitFor();
  }
  await page.waitForFunction(() => document.querySelector('#shell').dataset.layout === 'splitHorizontal');
  const wide = await metrics(page);
  if (!wide.director || !wide.prompter) throw new Error(`wide panes missing ${JSON.stringify(wide)}`);
  if (wide.prompterBox.width * wide.prompterBox.height < wide.viewport.width * wide.viewport.height * 0.45) {
    throw new Error(`prompter surface too small ${JSON.stringify(wide)}`);
  }
  if (wide.painted < 1000) throw new Error(`prompter canvas is blank ${wide.painted}`);
  await page.screenshot({ path: path.join(scratch, `windows-launch-${index}-wide.png`), fullPage: true });
  await page.locator('#pause').click();
  await page.waitForFunction(() => Number(document.querySelector('#shell').dataset.offset) > 0);
  await page.locator('#pause').click();
  const paused = await page.locator('#shell').getAttribute('data-offset');
  const playing = await page.locator('#shell').getAttribute('data-playing');
  if (playing !== 'false') throw new Error(`expected paused, got ${playing}`);
  await page.waitForTimeout(500);
  const held = await page.locator('#shell').getAttribute('data-offset');
  if (held !== paused) throw new Error(`pause did not hold offset ${paused} -> ${held}`);
  await page.locator('#editor').evaluate((element) => {
    const next = `${element.value}\n补一句`;
    element.value = next;
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  const edited = await page.locator('#shell').getAttribute('data-offset');
  if (edited === '0' || edited !== paused) throw new Error(`edit reset offset ${paused} -> ${edited}`);
  await page.locator('#editor').focus();
  await page.keyboard.press('Space');
  if (await page.locator('#shell').getAttribute('data-playing') !== 'false') {
    throw new Error('editor space paused the clock');
  }
  await page.locator('#prompter').click();
  await page.keyboard.press('Space');
  if (await page.locator('#shell').getAttribute('data-playing') !== 'true') {
    throw new Error('director space did not play');
  }
  await page.locator('#pause').click();
  if (await page.locator('#shell').getAttribute('data-playing') !== 'false') {
    throw new Error('on-screen pause did not pause');
  }
  await page.setViewportSize({ width: 500, height: 800 });
  await page.waitForFunction(() => document.querySelector('#shell').dataset.layout === 'fullPrompt');
  const narrow = await metrics(page);
  if (narrow.director) throw new Error('narrow layout still shows the editor');
  if (!narrow.prompter) throw new Error('narrow layout hid the prompter');
  const errors = consoleLog.filter((line) => line.startsWith('error:') || line.startsWith('pageerror:'));
  await page.screenshot({ path: path.join(scratch, `windows-launch-${index}.png`), fullPage: true });
  const report = {
    index,
    errors: errors.length,
    titles,
    headings: ['选题', '方法', '结果', '创新点'],
    wideLayout: wide.layout,
    narrowLayout: narrow.layout,
    wideDirector: wide.director,
    narrowDirector: narrow.director,
    pausedOffset: paused,
    offsetAfterEdit: edited,
    offsetReset: edited === '0',
    pauseHeld: held === paused
  };
  writeFileSync(path.join(scratch, `windows-launch-${index}.log`), [
    `errors ${errors.length}`,
    ...consoleLog,
    JSON.stringify({ report, wide, narrow, paused, edited }, null, 2),
    serverLog
  ].join('\n'));
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  await browser.close();
}

async function metrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#prompter');
    const director = document.querySelector('#director');
    const directorBox = director.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    const sample = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    const samples = sample.length / 16;
    for (let i = 0; i < sample.length; i += 16) {
      if (sample[i + 3] > 0) painted += 1;
    }
    if (painted < samples * 0.8) painted = 0;
    const directorVisible = directorBox.width > 2 && directorBox.height > 2 && getComputedStyle(director).display !== 'none';
    return {
      director: directorVisible,
      prompter: box.width > 2 && box.height > 2,
      prompterBox: { width: box.width, height: box.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      painted,
      layout: document.querySelector('#shell').dataset.layout
    };
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start\n${serverLog}`);
}
