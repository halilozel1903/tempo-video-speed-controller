(() => {
  if (globalThis.__tempoLoaded) return;
  globalThis.__tempoLoaded = true;
  const { defaults, normalize } = TempoSettings;
  const videos = new Map();
  const roots = new Map();
  const lifecycle = ['play', 'playing', 'loadedmetadata', 'loadeddata', 'emptied', 'canplay', 'seeked'];
  let settings = defaults;
  let ready = false;
  let stopped = false;
  const pendingChanges = {};

  function apply(video) {
    if (!ready || !settings.enabled || stopped) return;
    try {
      if (video.defaultPlaybackRate !== settings.speed) video.defaultPlaybackRate = settings.speed;
      if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
      if (video.preservesPitch !== settings.preservePitch) video.preservesPitch = settings.preservePitch;
    } catch {
      // A player may reject a rate before its media is ready. Lifecycle events retry it.
    }
  }

  function register(video) {
    if (videos.has(video)) return videos.get(video);
    const state = {
      original: { speed: video.playbackRate, defaultSpeed: video.defaultPlaybackRate, pitch: video.preservesPitch },
      retry: null,
    };
    state.onLifecycle = () => apply(video);
    state.onRateChange = () => {
      if (!ready || !settings.enabled || !settings.lockSpeed || state.retry !== null) return;
      if (video.playbackRate === settings.speed && video.defaultPlaybackRate === settings.speed) return;
      // Bound retries to avoid an event storm when a site also enforces its own speed.
      state.retry = setTimeout(() => {
        state.retry = null;
        apply(video);
      }, 80);
    };
    lifecycle.forEach(event => video.addEventListener(event, state.onLifecycle));
    video.addEventListener('ratechange', state.onRateChange);
    videos.set(video, state);
    apply(video);
    return state;
  }

  function release(video, state, restore = false) {
    clearTimeout(state.retry);
    lifecycle.forEach(event => video.removeEventListener(event, state.onLifecycle));
    video.removeEventListener('ratechange', state.onRateChange);
    if (restore) {
      try {
        video.defaultPlaybackRate = state.original.defaultSpeed;
        video.playbackRate = state.original.speed;
        video.preservesPitch = state.original.pitch;
      } catch { /* A detached media source may no longer accept changes. */ }
    }
    videos.delete(video);
  }

  function scan(node) {
    if (node instanceof HTMLVideoElement) register(node);
    if (node.shadowRoot) watch(node.shadowRoot);
    if (!node.querySelectorAll) return;
    node.querySelectorAll('video').forEach(register);
    // Open shadow roots can contain custom video players.
    node.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) watch(element.shadowRoot);
    });
  }

  function capture(event) {
    if (event.target instanceof HTMLVideoElement) {
      register(event.target);
      apply(event.target);
    }
  }

  function watch(root) {
    if (roots.has(root)) return;
    const observer = new MutationObserver(records => {
      for (const record of records) record.addedNodes.forEach(scan);
    });
    roots.set(root, observer);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('play', capture, true);
    scan(root);
  }

  function refresh() {
    for (const [video, state] of videos) {
      if (!video.isConnected) release(video, state);
      else apply(video);
    }
  }

  function update(value) {
    const wasEnabled = ready && settings.enabled;
    settings = normalize(value);
    ready = true;
    if (wasEnabled && !settings.enabled) {
      for (const [video, state] of videos) release(video, state, true);
    }
    scan(document);
    refresh();
  }

  function onStorage(changes, area) {
    if (area !== 'local') return;
    const next = { ...settings };
    let relevant = false;
    for (const key of Object.keys(defaults)) {
      if (Object.hasOwn(changes, key)) {
        relevant = true;
        next[key] = changes[key].newValue ?? defaults[key];
      }
    }
    if (relevant) {
      if (!ready) {
        for (const key of Object.keys(defaults)) {
          if (Object.hasOwn(changes, key)) pendingChanges[key] = next[key];
        }
      } else update(next);
    }
  }

  function stop() {
    stopped = true;
    clearInterval(maintenance);
    for (const [video, state] of videos) release(video, state);
    for (const [root, observer] of roots) {
      observer.disconnect();
      root.removeEventListener('play', capture, true);
    }
    roots.clear();
    document.removeEventListener('keydown', onKeyDown, true);
    chrome.storage.onChanged.removeListener(onStorage);
  }

  function onKeyDown(event) {
    if (!ready || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const target = event.composedPath()[0];
    if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    let speed;
    if (event.code === 'ArrowUp') speed = settings.speed + 0.1;
    else if (event.code === 'ArrowDown') speed = settings.speed - 0.1;
    else if (event.code === 'Digit0') speed = 1;
    else return;
    event.preventDefault();
    const next = normalize({ ...settings, speed, enabled: true });
    update(next);
    chrome.storage.local.set({ speed: next.speed, enabled: true }).catch(stop);
  }

  chrome.storage.onChanged.addListener(onStorage);
  document.addEventListener('keydown', onKeyDown, true);
  watch(document);
  // Also discovers shadow roots attached to elements already in the DOM, and heals silent resets.
  const maintenance = setInterval(() => {
    if (!chrome.runtime?.id) return stop();
    for (const [root, observer] of roots) {
      if (root !== document && !root.host.isConnected) {
        observer.disconnect();
        root.removeEventListener('play', capture, true);
        roots.delete(root);
      }
    }
    if (!document.hidden) scan(document);
    for (const [video, state] of videos) {
      if (!video.isConnected) release(video, state);
      else if (settings.lockSpeed && !video.paused) apply(video);
    }
  }, 1500);
  chrome.storage.local.get(defaults).then(value => {
    update({ ...value, ...pendingChanges });
  }).catch(() => {
    if (!ready) update({ ...defaults, ...pendingChanges });
  });
})();
