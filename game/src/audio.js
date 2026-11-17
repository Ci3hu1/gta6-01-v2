// Tiny WebAudio synth sound effects: no audio files, everything is an
// oscillator. The context is created on the first user gesture; every call is
// guarded so a headless or muted browser never throws.
export function createAudio() {
  let context = null;
  let sirenTimer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      context = new AC();
      return context;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, type, gain, slideTo) {
    const ctx = ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      amp.gain.setValueAtTime(gain || 0.08, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() { ensure(); },
    shoot() { tone(880, 0.08, 'square', 0.05, 220); },
    hit() { tone(160, 0.12, 'sawtooth', 0.09, 60); },
    crash() { tone(90, 0.25, 'sawtooth', 0.12, 40); },
    steal() { tone(520, 0.1, 'triangle', 0.07, 780); },
    mission() { tone(523, 0.12, 'triangle', 0.08); setTimeout(() => tone(784, 0.18, 'triangle', 0.08), 120); },
    fail() { tone(220, 0.3, 'sawtooth', 0.08, 110); },
    busted() { tone(330, 0.2, 'square', 0.08, 165); setTimeout(() => tone(330, 0.2, 'square', 0.08, 165), 220); },
    startSiren() {
      if (sirenTimer !== null) return;
      let high = true;
      sirenTimer = setInterval(() => {
        tone(high ? 720 : 540, 0.4, 'sine', 0.03);
        high = !high;
      }, 420);
    },
    stopSiren() {
      if (sirenTimer !== null) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },
  };
}
