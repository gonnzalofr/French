// Countdown timer. Time is computed from timestamps (not by counting ticks), so it stays
// correct across reloads and throttled background tabs.
import { h } from "./dom.js";

/** @typedef {{remainingMs:number, runningSince:number|null}} TimerState */

export function remainingMs(t, now = Date.now()) {
  if (!t.runningSince) return Math.max(0, t.remainingMs);
  return Math.max(0, t.remainingMs - (now - t.runningSince));
}

export function formatMs(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function startTimer(t, now = Date.now()) {
  if (t.runningSince || t.remainingMs <= 0) return t;
  return { remainingMs: t.remainingMs, runningSince: now };
}

export function pauseTimer(t, now = Date.now()) {
  return { remainingMs: remainingMs(t, now), runningSince: null };
}

/**
 * DOM timer widget.
 * @param {{label:string, totalMs:number, state:TimerState|undefined, onChange:(s:TimerState)=>void,
 *          onStart?:()=>void, onFinish?:()=>void}} opts
 */
export function createTimer({ label, totalMs, state, onChange, onStart, onFinish }) {
  let t = state ?? { remainingMs: totalMs, runningSince: null };
  let interval = null;
  const originalTitle = document.title;

  // Finished while the page was closed: settle silently.
  if (t.runningSince && remainingMs(t) === 0) {
    t = { remainingMs: 0, runningSince: null };
    onChange(t);
  }

  const display = h("span", { class: "timer-display", role: "timer", "aria-label": `${label} timer` });
  const bar = h("span", { class: "timer-bar-fill" });
  const startBtn = h("button", { type: "button", class: "btn btn-primary", onclick: toggle });
  const resetBtn = h("button", { type: "button", class: "btn", onclick: reset }, "Reset");
  const el = h(
    "div",
    { class: "timer" },
    display,
    h("span", { class: "timer-buttons" }, startBtn, resetBtn),
    h("span", { class: "timer-bar", "aria-hidden": "true" }, bar),
  );

  function paint() {
    const left = remainingMs(t);
    display.textContent = formatMs(left);
    bar.style.width = `${(100 * (totalMs - left)) / totalMs}%`;
    const running = Boolean(t.runningSince);
    startBtn.textContent = running ? "Pause" : left === 0 ? "Done" : left < totalMs ? "Resume" : "Start";
    startBtn.disabled = left === 0;
    el.dataset.state = running ? "running" : left === 0 ? "finished" : "idle";
    if (running) document.title = `${formatMs(left)} · ${label}`;
  }

  function tick() {
    if (t.runningSince && remainingMs(t) === 0) {
      t = { remainingMs: 0, runningSince: null };
      stopTicking();
      onChange(t);
      paint();
      onFinish?.();
      return;
    }
    paint();
  }

  function startTicking() {
    stopTicking();
    interval = setInterval(tick, 250);
  }

  function stopTicking() {
    if (interval) clearInterval(interval);
    interval = null;
    document.title = originalTitle;
  }

  function toggle() {
    if (t.runningSince) {
      pause();
    } else {
      onStart?.();
      t = startTimer(t);
      onChange(t);
      startTicking();
      paint();
    }
  }

  function pause() {
    if (!t.runningSince) return;
    t = pauseTimer(t);
    onChange(t);
    stopTicking();
    paint();
  }

  function reset() {
    t = { remainingMs: totalMs, runningSince: null };
    onChange(t);
    stopTicking();
    paint();
  }

  paint();
  if (t.runningSince) startTicking();

  return {
    el,
    pause,
    isRunning: () => Boolean(t.runningSince),
    destroy: stopTicking,
  };
}
