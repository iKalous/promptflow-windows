import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.SCRATCH;
if (!scratch) throw new Error('SCRATCH is required');
mkdirSync(scratch, { recursive: true });
const exe = path.join(root, 'dist', 'PromptFlow.exe');
if (!existsSync(exe)) throw new Error('missing ' + exe);

const titles = ['3 分钟自我介绍', '8 分钟答辩', '20 分钟网课节导', '60 秒招新'];
const headings = ['选题', '方法', '结果', '创新点'];

try {
  await runOnce(1);
  await runOnce(2);
} finally {
  rmSync(path.join(root, 'dist', 'running.json'), { force: true });
}

async function runOnce(index) {
  rmSync(path.join(root, 'dist', 'running.json'), { force: true });
  const child = spawn(exe, [], { cwd: root, windowsHide: true, stdio: 'ignore' });
  let browser;
  const consoleLog = [];
  try {
    const ready = await waitReady(path.join(root, 'dist', 'running.json'), 25000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${ready.cdp}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', (error) => consoleLog.push(`pageerror: ${error.message}`));
    await page.goto(ready.url, { waitUntil: 'networkidle' });
    for (const title of titles) {
      await page.getByText(title, { exact: true }).first().waitFor();
    }
    await page.screenshot({ path: path.join(scratch, `windows-app-launch-${index}-library.png`), fullPage: true });
    await page.getByRole('button', { name: /8 分钟答辩/ }).click();
    for (const heading of headings) {
      await page.locator('#outline').getByText(heading, { exact: true }).waitFor();
    }
    await page.waitForFunction(() => document.querySelector('#shell').dataset.layout === 'splitHorizontal');
    const wide = await metrics(page);
    if (!wide.director || !wide.prompter) throw new Error(`wide panes missing ${JSON.stringify(wide)}`);
    if (wide.prompterBox.width * wide.prompterBox.height < wide.viewport.width * wide.viewport.height * 0.45) {
      throw new Error(`prompter surface too small ${JSON.stringify(wide)}`);
    }
    if (wide.painted < 1000) throw new Error(`prompter canvas is blank ${wide.painted}`);
    await page.screenshot({ path: path.join(scratch, `windows-app-launch-${index}-wide.png`), fullPage: true });
    await page.locator('#pause').click();
    await page.waitForFunction(() => Number(document.querySelector('#shell').dataset.offset) > 0);
    await page.locator('#pause').click();
    const paused = await page.locator('#shell').getAttribute('data-offset');
    if (await page.locator('#shell').getAttribute('data-playing') !== 'false') throw new Error('did not pause');
    await page.waitForTimeout(400);
    if (await page.locator('#shell').getAttribute('data-offset') !== paused) throw new Error('pause did not hold');
    await page.locator('#editor').evaluate((element) => {
      element.value = `${element.value}\n补一句`;
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    const edited = await page.locator('#shell').getAttribute('data-offset');
    if (edited === '0' || edited !== paused) throw new Error(`edit reset offset ${paused} -> ${edited}`);
    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForFunction(() => document.querySelector('#shell').dataset.layout === 'fullPrompt');
    const narrow = await metrics(page);
    if (narrow.director) throw new Error('narrow layout still shows the editor');
    if (!narrow.prompter) throw new Error('narrow layout hid the prompter');
    await page.screenshot({ path: path.join(scratch, `windows-app-launch-${index}.png`), fullPage: true });
    const errors = consoleLog.filter((line) => line.startsWith('error:') || line.startsWith('pageerror:'));
    const report = {
      index,
      exe,
      url: ready.url,
      errors: errors.length,
      titles,
      headings,
      wideLayout: wide.layout,
      narrowLayout: narrow.layout,
      wideDirector: wide.director,
      narrowDirector: narrow.director,
      pausedOffset: paused,
      offsetAfterEdit: edited,
      offsetReset: edited === '0',
      pauseHeld: true
    };
    writeFileSync(path.join(scratch, `windows-app-launch-${index}.log`), [
      `errors ${errors.length}`,
      ...consoleLog,
      JSON.stringify({ report, wide, narrow }, null, 2)
    ].join('\n'));
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (errors.length > 0) throw new Error(errors.join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await killTree(child.pid);
    await waitClosed(path.join(root, 'dist', 'running.json'));
  }
}

async function waitReady(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const ready = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (ready.url && ready.cdp) return ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('packaged app did not write ' + file);
}

async function waitClosed(file) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && existsSync(file)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function killTree(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
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
