// Pure stats computed from saved days. Nothing here is stored, so it can't drift.
import { CORE_BLOCKS, coreDoneCount, hasActivity, splitWord } from "./day.js";
import { addDaysIso, daysBetween, weekStartIso, WEEKDAY_KEYS, parseLocalDate } from "./schedule.js";

/** A day counts when Anki, Listening and Focus are all ticked (the log is optional). */
export function isComplete(day) {
  return coreDoneCount(day) === CORE_BLOCKS.length;
}

/**
 * Consecutive complete days ending today. If today isn't complete yet, the streak
 * ending yesterday is still alive (you have until midnight).
 */
export function currentStreak(days, todayIso) {
  let n = isComplete(days[todayIso]) ? 1 : 0;
  let iso = addDaysIso(todayIso, -1);
  while (isComplete(days[iso])) {
    n += 1;
    iso = addDaysIso(iso, -1);
  }
  return n;
}

export function longestStreak(days) {
  const complete = Object.keys(days).filter((iso) => isComplete(days[iso])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const iso of complete) {
    run = prev && daysBetween(prev, iso) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = iso;
  }
  return best;
}

export function totals(days) {
  const all = Object.values(days);
  return {
    sessions: all.filter(isComplete).length,
    activeDays: all.filter(hasActivity).length,
    words: all.reduce((n, d) => n + (d.blocks?.listening?.words?.length ?? 0), 0),
    recordings: all.reduce((n, d) => n + (d.blocks?.focus?.recordingIds?.length ?? 0), 0),
  };
}

/** Words noted between two dates (inclusive), oldest first. */
export function collectWords(days, fromIso, toIso) {
  return Object.keys(days)
    .filter((iso) => iso >= fromIso && iso <= toIso)
    .sort()
    .flatMap((iso) => (days[iso].blocks?.listening?.words ?? []).map((entry) => ({ iso, entry })));
}

/** Tab-separated "front<TAB>back" lines, which Anki's File → Import reads directly. */
export function wordsToAnki(entries) {
  const clean = (s) => s.replace(/[\t\r\n]+/g, " ").trim();
  const seen = new Set();
  const lines = [];
  for (const { entry } of entries) {
    const { front, back } = splitWord(entry);
    const key = front.toLowerCase();
    if (!front || seen.has(key)) continue;
    seen.add(key);
    lines.push(`${clean(front)}\t${clean(back)}`);
  }
  return lines.join("\n");
}

/** Average 1–5 self-ratings for speaking days in a date range. */
export function averageRatings(days, fromIso, toIso) {
  const sums = { fluency: [0, 0], pronunciation: [0, 0], accuracy: [0, 0] };
  for (const [iso, day] of Object.entries(days)) {
    if (iso < fromIso || iso > toIso) continue;
    const r = day.blocks?.focus?.rating;
    if (!r) continue;
    for (const k of Object.keys(sums)) {
      if (Number.isInteger(r[k])) {
        sums[k][0] += r[k];
        sums[k][1] += 1;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(sums).map(([k, [sum, n]]) => [k, n ? Math.round((sum / n) * 10) / 10 : null]),
  );
}

/**
 * Monday–Saturday of the week containing `iso`, with what was done and what was missed.
 * Days before `startIso` (before you began) are flagged `beforeStart` rather than missed.
 */
export function weekSummary(days, iso, focusFor, startIso = "0000-01-01") {
  const monday = weekStartIso(iso);
  return Array.from({ length: 6 }, (_, i) => {
    const d = addDaysIso(monday, i);
    const day = days[d];
    return {
      iso: d,
      weekday: WEEKDAY_KEYS[parseLocalDate(d).getDay()],
      focusType: day?.focusType ?? focusFor(d),
      done: coreDoneCount(day),
      missing: CORE_BLOCKS.filter((k) => !day?.blocks?.[k]?.done),
      future: d > iso,
      beforeStart: d < startIso && !hasActivity(day),
      day,
    };
  });
}

/** Weeks (Monday-first) covering the last `count` weeks up to `todayIso`, for the calendar. */
export function calendarWeeks(todayIso, count = 12) {
  const lastMonday = weekStartIso(todayIso);
  return Array.from({ length: count }, (_, w) => {
    const monday = addDaysIso(lastMonday, -7 * (count - 1 - w));
    return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  });
}
