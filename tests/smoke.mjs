// Solmar Bay smoke test — headless Chromium over CDP, pure Node stdlib.
// Serves game/ with the repo's own serve.ts, loads the page, checks for zero
// console errors and zero non-localhost requests, exercises the real game
// (title -> play, drive right), and captures the four ?shot= scenes into
// screenshots/. Run: node tests/smoke.mjs
import { spawn, execFile } from 'node:child_process';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8901;
const CDP_PORT = 9223;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const SHOTS = [
  { name: 'start', file: '1-start.jpg' },
  { name: 'drive', file: '2-drive.jpg' },
  { name: 'chase', file: '3-chase.jpg' },
  { name: 'victory', file: '4-victory.jpg' },
];

const errors = [];
const externalRequests = [];
const failedRequests = [];
let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // keep waiting
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(250);
  }
}

// JPEG dimensions: scan for the SOF0/SOF2 marker.
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

async function main() {
  await mkdir(join(ROOT, 'screenshots'), { recursive: true });

  // 1. Serve the game with the repo's own serve.ts.
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
  server.stderr.on('data', (d) => errors.push(`serve.ts stderr: ${d}`));
  await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    return res.ok;
  }, 15000, 'serve.ts to answer');
  console.log('  ok  serve.ts answers on port 8901');

  // 2. Launch the cached Chromium with remote debugging.
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-sandbox',
    '--disable-gpu', '--window-size=1280,800', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  const { webSocketDebuggerUrl } = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return res.json();
  }, 20000, 'chrome devtools');
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id !== undefined && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) {
      events.push(data);
    }
  };
  function send(method, params = {}, sessionId) {
    return new Promise((resolve) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async function evaljs(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (res.result?.exceptionDetails) throw new Error(`evaluate failed: ${expression}`);
    return res.result?.result?.value;
  }

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;
  const attach = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attach.result.sessionId;
  // Pin the viewport to exactly 1280x800: the window size alone leaves the
  // viewport shorter (browser chrome), which would crop the screenshots.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);

  // Drain the event queue into the error buckets.
  const drain = setInterval(() => {
    while (events.length > 0) {
      const e = events.shift();
      if (e.method === 'Runtime.exceptionThrown') {
        errors.push(`exception: ${e.params.exceptionDetails?.text || ''} ${e.params.exceptionDetails?.exception?.description || ''}`);
      } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        errors.push(`console.error: ${e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        errors.push(`log error: ${e.params.entry.text} ${e.params.entry.url || ''}`);
      } else if (e.method === 'Network.requestWillBeSent') {
        const url = e.params.request.url;
        if (!url.startsWith(`http://127.0.0.1:${PORT}/`) && !url.startsWith(`http://localhost:${PORT}/`) && !url.startsWith('data:')) {
          externalRequests.push(url);
        }
      } else if (e.method === 'Network.loadingFailed') {
        failedRequests.push(`${e.params.errorText} ${e.params.type || ''}`);
      } else if (e.method === 'Network.responseReceived' && e.params.response.status >= 400) {
        failedRequests.push(`HTTP ${e.params.response.status} ${e.params.response.url}`);
      }
    }
  }, 100);

  try {
    // 3. Interactive smoke: title -> play, drive right.
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, sessionId);
    await waitFor(async () => (await evaljs('document.readyState')) === 'complete', 10000, 'page load');
    await waitFor(async () => (await evaljs('!!window.__solmar')) === true, 10000, 'game boot');
    check('game boots and exposes window.__solmar', true);
    check('title screen shows first', (await evaljs('window.__solmar.getScreen()')) === 'title');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await waitFor(async () => (await evaljs('window.__solmar.getScreen()')) === 'play', 5000, 'game to start');
    check('Enter starts the game', true);
    const x0 = await evaljs('window.__solmar.world.state.player.x');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, sessionId);
    await sleep(1000);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, sessionId);
    const x1 = await evaljs('window.__solmar.world.state.player.x');
    check('ArrowRight moves the player right', x1 > x0);
    const shotA = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, sessionId);
    await sleep(500);
    const shotB = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, sessionId);
    check('the canvas animates (two frames differ)', shotA.result.data !== shotB.result.data);

    // 4. The four staged scenes.
    for (const shot of SHOTS) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?shot=${shot.name}&seed=1` }, sessionId);
      await waitFor(async () => (await evaljs('window.__shotReady === true')) === true, 40000, `${shot.name} scene to finish`);
      const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, sessionId);
      const buf = Buffer.from(shotRes.result.data, 'base64');
      const path = join(ROOT, 'screenshots', shot.file);
      await writeFile(path, buf);
      const size = jpegSize(buf);
      const st = await stat(path);
      check(`${shot.file}: 1280x800 JPEG under 256 KiB (${(st.size / 1024).toFixed(0)} KiB)`,
        size?.width === 1280 && size?.height === 800 && st.size <= 256 * 1024);
    }
  } finally {
    clearInterval(drain);
    ws.close();
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }

  check('zero console errors / exceptions', errors.length === 0);
  if (errors.length > 0) errors.forEach((e) => console.log(`      ${e}`));
  check('zero non-localhost requests', externalRequests.length === 0);
  if (externalRequests.length > 0) externalRequests.forEach((u) => console.log(`      ${u}`));
  check('zero failed requests', failedRequests.length === 0);
  if (failedRequests.length > 0) failedRequests.forEach((e) => console.log(`      ${e}`));

  console.log(`\nsmoke: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`smoke crashed: ${err.message}`);
  process.exit(1);
});
