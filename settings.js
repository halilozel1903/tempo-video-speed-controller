(() => {
  const defaults = Object.freeze({ speed: 1.5, enabled: true, lockSpeed: true, preservePitch: true });
  const normalize = (value = {}) => ({
    speed: typeof value.speed === 'number' && Number.isFinite(value.speed)
      ? Math.round(Math.min(4, Math.max(0.25, value.speed)) * 100) / 100 : defaults.speed,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
    lockSpeed: typeof value.lockSpeed === 'boolean' ? value.lockSpeed : defaults.lockSpeed,
    preservePitch: typeof value.preservePitch === 'boolean' ? value.preservePitch : defaults.preservePitch,
  });
  globalThis.TempoSettings = Object.freeze({ defaults, normalize });
})();
