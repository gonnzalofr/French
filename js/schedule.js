// Pure scheduling logic: no DOM, no storage. Safe to import from Node tests.

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const BLOCK_ORDER = ["anki", "listening", "focus", "log"];

export const BLOCK_LABELS = {
  anki: "Anki",
  listening: "Listening",
  focus: "Focus",
  log: "Quick log",
};

export const FOCUS_TYPES = {
  "grammar-learn": { label: "Grammar: learn", short: "Grammar" },
  "grammar-drill": { label: "Grammar: drill", short: "Grammar" },
  speaking: { label: "Speaking", short: "Speaking" },
  writing: { label: "Writing", short: "Writing" },
  review: { label: "Review & free choice", short: "Review" },
};

/** Local calendar date as YYYY-MM-DD (never UTC, so evening sessions stay on the right day). */
export function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as local midnight. Returns null for anything invalid. */
export function parseLocalDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  const valid =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return valid ? date : null;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function addDaysIso(iso, n) {
  return toLocalISODate(addDays(parseLocalDate(iso), n));
}

/** Whole days from a to b (b - a), immune to DST shifts. */
export function daysBetween(aIso, bIso) {
  const utc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(bIso) - utc(aIso)) / 86400000);
}

/** Monday of the week containing `iso`. */
export function weekStartIso(iso) {
  const d = parseLocalDate(iso);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return toLocalISODate(addDays(d, -offset));
}

export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()];
}

export function focusForDate(date, config) {
  return config.focusByWeekday[weekdayKey(date)];
}

/** "17:30" + 10 → "17:40". Wraps past midnight. */
export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The ordered blocks for a given date, with clock times.
 * @returns {{key:string,label:string,minutes:number,start:string,end:string,focusType?:string}[]}
 */
export function sessionPlan(date, config, focusType = focusForDate(date, config)) {
  let cursor = config.sessionStart;
  return BLOCK_ORDER.map((key) => {
    const minutes = config.blocks[key].minutes;
    const block = {
      key,
      label: key === "focus" ? FOCUS_TYPES[focusType].label : BLOCK_LABELS[key],
      minutes,
      start: cursor,
      end: addMinutes(cursor, minutes),
    };
    if (key === "focus") block.focusType = focusType;
    cursor = block.end;
    return block;
  });
}

export function totalMinutes(config) {
  return BLOCK_ORDER.reduce((sum, key) => sum + config.blocks[key].minutes, 0);
}

/** Which block (if any) the wall clock is currently in. */
export function currentBlockKey(plan, now) {
  const t = now.getHours() * 60 + now.getMinutes();
  const hit = plan.find((b) => {
    const s = minutesOfDay(b.start);
    const e = minutesOfDay(b.end);
    return s <= e ? t >= s && t < e : t >= s || t < e;
  });
  return hit ? hit.key : null;
}
