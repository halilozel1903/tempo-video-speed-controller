(() => {
  const { defaults, normalize } = TempoSettings;
  const $ = id => document.getElementById(id);
  let settings = defaults;
  let feedbackTimer;
  let saveQueue = Promise.resolve();
  let ready = false;
  const pendingChanges = {};

  function render() {
    $('enabled').checked = settings.enabled;
    $('lock-speed').checked = settings.lockSpeed;
    $('preserve-pitch').checked = settings.preservePitch;
    $('speed').value = settings.speed;
    $('speed').style.background = `linear-gradient(to right, #b49bff ${(settings.speed - 0.25) / 3.75 * 100}%, #34303e 0%)`;
    $('speed-value').textContent = String(settings.speed);
    $('status').textContent = settings.enabled ? 'TÜM VİDEOLAR İÇİN HAZIR' : 'HIZ KONTROLÜ KAPALI';
    document.body.dataset.enabled = settings.enabled;
    document.querySelectorAll('[data-speed]').forEach(button => {
      button.setAttribute('aria-pressed', Number(button.dataset.speed) === settings.speed);
    });
  }

  function feedback(message, error = false) {
    clearTimeout(feedbackTimer);
    $('feedback').textContent = message;
    $('feedback').classList.toggle('error', error);
    if (!error) feedbackTimer = setTimeout(() => { $('feedback').textContent = ''; }, 1700);
  }

  function save(patch) {
    const next = normalize({ ...settings, ...patch });
    const validPatch = Object.fromEntries(Object.keys(patch).map(key => [key, next[key]]));
    settings = next;
    render();
    // Serialize slider writes so the last chosen value also wins on disk.
    saveQueue = saveQueue.then(() => chrome.storage.local.set(validPatch)).then(() => {
      feedback('Tercihin kaydedildi');
    }).catch(() => feedback('Kaydedilemedi. Extension panelini yeniden aç.', true));
  }

  $('speed').addEventListener('input', event => save({ speed: Number(event.target.value) }));
  $('decrease').addEventListener('click', () => save({ speed: settings.speed - 0.1 }));
  $('increase').addEventListener('click', () => save({ speed: settings.speed + 0.1 }));
  $('enabled').addEventListener('change', event => save({ enabled: event.target.checked }));
  $('lock-speed').addEventListener('change', event => save({ lockSpeed: event.target.checked }));
  $('preserve-pitch').addEventListener('change', event => save({ preservePitch: event.target.checked }));
  document.querySelectorAll('[data-speed]').forEach(button => {
    button.addEventListener('click', () => save({ speed: Number(button.dataset.speed) }));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const next = { ...settings };
    for (const key of Object.keys(defaults)) {
      if (Object.hasOwn(changes, key)) {
        next[key] = changes[key].newValue ?? defaults[key];
        if (!ready) pendingChanges[key] = next[key];
      }
    }
    if (!ready) return;
    settings = normalize(next);
    render();
  });
  chrome.storage.local.get(defaults).then(value => {
    settings = normalize({ ...value, ...pendingChanges });
    ready = true;
    render();
    document.querySelectorAll('button, input').forEach(element => { element.disabled = false; });
  }).catch(() => feedback('Ayarlar okunamadı. Extension panelini yeniden aç.', true));
})();
