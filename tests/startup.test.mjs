import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const settingsSource = await readFile(new URL('../settings.js', import.meta.url), 'utf8');
const contentSource = await readFile(new URL('../content.js', import.meta.url), 'utf8');

function startup() {
  class Video extends EventTarget {
    playbackRate = 1;
    defaultPlaybackRate = 1;
    preservesPitch = true;
    isConnected = true;
    paused = true;
  }
  const video = new Video();
  const document = new EventTarget();
  document.querySelectorAll = selector => selector === 'video' ? [video] : [];
  let resolveRead, onChange;
  const scope = vm.createContext({
    document, HTMLVideoElement: Video,
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    chrome: {
      runtime: { id: 'test' },
      storage: {
        local: { get: () => new Promise(resolve => { resolveRead = resolve; }) },
        onChanged: { addListener: callback => { onChange = callback; }, removeListener() {} },
      },
    },
  });
  vm.runInContext(settingsSource, scope);
  vm.runInContext(contentSource, scope);
  return { video, resolveRead, change: patch => onChange(patch, 'local'), scope };
}

it('waits for persisted preferences before touching a video', async () => {
  const { video, resolveRead } = startup();
  assert.equal(video.playbackRate, 1);
  resolveRead({ speed: 2.75, enabled: true, lockSpeed: true, preservePitch: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.playbackRate, 2.75);
});

it('preserves a concurrent disable without losing the stored speed during startup', async () => {
  const { video, resolveRead, change } = startup();
  change({ enabled: { newValue: false } });
  assert.equal(video.playbackRate, 1);
  resolveRead({ speed: 2.75, enabled: true, lockSpeed: true, preservePitch: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.playbackRate, 1);
  change({ enabled: { newValue: true } });
  assert.equal(video.playbackRate, 2.75);
});

it('keeps a newer speed when an older storage read resolves later', async () => {
  const { video, resolveRead, change } = startup();
  change({ speed: { newValue: 3 } });
  resolveRead({ speed: 1.75, enabled: true, lockSpeed: true, preservePitch: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.playbackRate, 3);
});

it('rejects invalid saved values and clamps speeds to the supported range', () => {
  const { scope } = startup();
  assert.equal(vm.runInContext('TempoSettings.normalize({speed: Infinity}).speed', scope), 1.5);
  assert.equal(vm.runInContext('TempoSettings.normalize({speed: "2"}).speed', scope), 1.5);
  assert.equal(vm.runInContext('TempoSettings.normalize({speed: 100}).speed', scope), 4);
  assert.equal(vm.runInContext('TempoSettings.normalize({speed: -1}).speed', scope), .25);
  assert.equal(vm.runInContext('TempoSettings.normalize({enabled: "false"}).enabled', scope), true);
});
