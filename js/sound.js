// End-of-timer chime made with Web Audio, so there's no audio file to ship.
let ctx = null;

/** Call from a click handler so the browser allows sound later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    /* no audio support: stay silent */
  }
}

export function playChime() {
  unlockAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [659.25, 880, 1046.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1);
  });
}
