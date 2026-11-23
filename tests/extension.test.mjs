import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const id = [...createHash('sha256').update(root).digest('hex').slice(0, 32)]
  .map(character => String.fromCharCode(97 + Number.parseInt(character, 16))).join('');
const defaults = { speed: 1.5, enabled: true, lockSpeed: true, preservePitch: true };
const html = `<!doctype html><html><head><title>Tempo playback fixture</title></head>
<body><h1>Tempo playback fixture</h1><video id="main" src="/sample.webm" muted loop controls></video>
<input aria-label="Typing area"><div id="host"></div></body></html>`;
let server, server2, origin, otherOrigin, context, popup, profile;
const errors = [];

async function serve() {
  const video = await readFile(join(root, 'tests/fixtures/sample.webm'));
  const instance = createServer((request, response) => {
    if (request.url?.startsWith('/sample.webm')) {
      response.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': video.length });
      response.end(video);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    }
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return instance;
}

async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--autoplay-policy=no-user-gesture-required'],
    viewport: { width: 1000, height: 720 },
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => !document.getElementById('enabled').disabled);
}

async function settings(patch) {
  await popup.evaluate(patch => chrome.storage.local.set(patch), patch);
}

async function openVideo() {
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  return page;
}

async function expectRate(page, value, selector = 'video') {
  await page.waitForFunction(({ selector, value }) => {
    const elements = [...document.querySelectorAll(selector)];
    return elements.length && elements.every(video => video.playbackRate === value);
  }, { selector, value }, { timeout: 7000 });
}

describe('Tempo in real Microsoft Edge', { concurrency: false, timeout: 120000 }, () => {
  before(async () => {
    await mkdir(join(root, 'build'), { recursive: true });
    profile = await mkdtemp(join(tmpdir(), 'tempo-edge-test-'));
    server = await serve();
    server2 = await serve();
    origin = `http://127.0.0.1:${server.address().port}`;
    otherOrigin = `http://127.0.0.1:${server2.address().port}`;
    await launch();
    console.log(`Browser under test: ${context.browser().version()}`);
  });

  beforeEach(async () => {
    for (const page of context.pages()) if (page !== popup) await page.close();
    await settings(defaults);
  });

  after(async () => {
    await context?.close();
    await Promise.all([server, server2].filter(Boolean).map(instance => new Promise(resolve => instance.close(resolve))));
    if (profile) await rm(profile, { recursive: true, force: true });
  });

  it('loads as a real extension with only the storage API permission', async () => {
    assert.match(await popup.title(), /Tempo/);
    const manifest = await popup.evaluate(() => chrome.runtime.getManifest());
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.content_scripts[0].all_frames, true);
  });

  it('uses the saved speed on initial load and every real replay', async () => {
    await settings({ speed: 2.25, lockSpeed: false });
    const page = await openVideo();
    await expectRate(page, 2.25);
    for (let index = 0; index < 4; index++) {
      await page.evaluate(async () => {
        const video = document.querySelector('video');
        video.pause();
        video.playbackRate = 1;
        await video.play();
      });
      await expectRate(page, 2.25);
      assert.equal(await page.locator('video').evaluate(video => video.paused), false);
    }
  });

  it('repairs site speed resets, but lets site controls work when the lock is off', async () => {
    const page = await openVideo();
    await expectRate(page, 1.5);
    await page.locator('video').evaluate(video => { video.playbackRate = 1; });
    await expectRate(page, 1.5);
    await settings({ lockSpeed: false });
    await popup.waitForFunction(() => !document.getElementById('lock-speed').checked);
    await page.locator('video').evaluate(video => { video.playbackRate = 1.75; });
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('video').evaluate(video => video.playbackRate), 1.75);
    await page.locator('video').evaluate(video => video.play());
    await expectRate(page, 1.5);
  });

  it('reapplies speed after a media source reload and seek', async () => {
    await settings({ speed: 1.75 });
    const page = await openVideo();
    await page.locator('video').evaluate(video => {
      video.src = '/sample.webm?new-source';
      video.load();
    });
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await expectRate(page, 1.75);
    assert.equal(await page.locator('video').evaluate(video => video.defaultPlaybackRate), 1.75);
    await page.locator('video').evaluate(async video => { video.currentTime = 2; await video.play(); });
    await expectRate(page, 1.75);
  });

  it('finds replacement videos after SPA navigation and ignores audio', async () => {
    await settings({ speed: 3 });
    const page = await openVideo();
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/next');
      document.querySelector('video').remove();
      const video = document.createElement('video');
      video.src = '/sample.webm'; video.muted = true;
      document.body.append(video);
      document.body.append(document.createElement('audio'));
    });
    await expectRate(page, 3);
    assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 1);
  });

  it('handles cross-origin frames and about:srcdoc frames', async () => {
    await settings({ speed: 2 });
    const page = await openVideo();
    await page.evaluate(otherOrigin => {
      const remote = document.createElement('iframe'); remote.src = otherOrigin; document.body.append(remote);
      const local = document.createElement('iframe');
      local.srcdoc = '<video id="embedded" muted controls></video>'; document.body.append(local);
    }, otherOrigin);
    await page.frameLocator('iframe').nth(0).locator('video').waitFor();
    await page.frameLocator('iframe').nth(1).locator('video').waitFor({ state: 'attached' });
    const remote = page.frames().find(frame => frame.url() === `${otherOrigin}/`);
    const local = page.frames().find(frame => frame.url() === 'about:srcdoc');
    assert.ok(remote, 'Cross-origin frame loaded');
    assert.ok(local, 'srcdoc frame loaded');
    await expectRate(remote, 2);
    await expectRate(local, 2);
  });

  it('finds videos in a shadow root attached after its host was inserted', async () => {
    await settings({ speed: 2.5 });
    const page = await openVideo();
    await page.evaluate(() => {
      document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<video muted></video>';
    });
    await page.waitForFunction(() => document.getElementById('host').shadowRoot.querySelector('video').playbackRate === 2.5);
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'second';
      host.attachShadow({ mode: 'open' }).innerHTML = '<video muted></video>';
      document.body.append(host);
    });
    await page.waitForFunction(() => document.getElementById('second').shadowRoot.querySelector('video').playbackRate === 2.5);
  });

  it('restores original video settings on disable and controls them again on enable', async () => {
    const page = await openVideo();
    await page.evaluate(() => {
      const video = document.createElement('video');
      video.id = 'custom'; video.playbackRate = .75; video.defaultPlaybackRate = .75; video.preservesPitch = false;
      document.body.append(video);
    });
    await expectRate(page, 1.5);
    await settings({ enabled: false });
    await expectRate(page, .75, '#custom');
    await expectRate(page, 1, '#main');
    assert.equal(await page.locator('#custom').evaluate(video => video.preservesPitch), false);
    await settings({ enabled: true, speed: 2, preservePitch: false });
    await expectRate(page, 2);
    assert.equal(await page.locator('#main').evaluate(video => video.preservesPitch), false);
    await settings({ preservePitch: true });
    await page.waitForFunction(() => document.getElementById('main').preservesPitch);
  });

  it('applies popup selections to existing videos across multiple tabs', async () => {
    const page = await openVideo();
    const second = await openVideo();
    await popup.locator('[data-speed="2"]').click();
    await expectRate(page, 2);
    await expectRate(second, 2);
    assert.equal(await popup.locator('#speed-value').innerText(), '2');
    await popup.locator('#increase').click();
    await expectRate(page, 2.1);
    await popup.locator('#decrease').click();
    await expectRate(page, 2);
    await popup.setViewportSize({ width: 364, height: 620 });
    await popup.screenshot({ path: join(root, 'build/popup.png'), fullPage: true, animations: 'disabled' });
  });

  it('supports shortcuts, clamps limits, and does not intercept text inputs', async () => {
    const page = await openVideo();
    await expectRate(page, 1.5);
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await expectRate(page, 1.6);
    await page.locator('input').focus();
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('video').evaluate(video => video.playbackRate), 1.6);
    await page.locator('input').evaluate(element => element.blur());
    await page.keyboard.press('Alt+Shift+Digit0');
    await expectRate(page, 1);
    await settings({ speed: 4 });
    await expectRate(page, 4);
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await expectRate(page, 4);
    await settings({ speed: .25 });
    await expectRate(page, .25);
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await expectRate(page, .25);
  });

  it('keeps the final value after rapid slider updates', async () => {
    const page = await openVideo();
    await popup.locator('#speed').evaluate(slider => {
      for (const value of [1, 1.25, 2, 3, 1.75]) {
        slider.value = value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await expectRate(page, 1.75);
    await popup.waitForFunction(async () => (await chrome.storage.local.get('speed')).speed === 1.75);
    await popup.reload();
    await popup.waitForFunction(() => document.getElementById('speed-value').textContent === '1.75');
  });

  it('remembers the chosen speed after restarting Edge', async () => {
    await settings({ speed: 2.75 });
    await context.close();
    await launch();
    const page = await openVideo();
    await expectRate(page, 2.75);
    assert.equal(await popup.locator('#speed-value').innerText(), '2.75');
    assert.deepEqual(errors, [], 'No uncaught page or popup errors');
  });
});
