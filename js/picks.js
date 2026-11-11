// Pure rotation logic: which podcast / prompt / drill to show on a given day.
//
// Rule: prefer the item used the fewest times; among those, prefer items tagged with
// the current grammar topic, then the one used longest ago, then file order.
// "Used" means the block was ticked done that day, so a skipped day doesn't burn an item.

/**
 * Count how often each id was used on days strictly before `beforeIso`.
 * @param {object} days state.days
 * @param {string} beforeIso
 * @param {(day:object)=>string|string[]|null|undefined} getId the id(s) used that day, or nothing
 * @returns {{counts: Map<string,number>, last: Map<string,string>}}
 */
export function usageBefore(days, beforeIso, getId) {
  const counts = new Map();
  const last = new Map();
  for (const iso of Object.keys(days).sort()) {
    if (iso >= beforeIso) break;
    const got = getId(days[iso]);
    for (const id of Array.isArray(got) ? got : [got]) {
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      last.set(id, iso);
    }
  }
  return { counts, last };
}

/** Items sorted best-first according to the rule above. */
export function rankItems(items, usage, preferTopic = null) {
  return items
    .map((item, index) => ({
      item,
      index,
      count: usage.counts.get(item.id) ?? 0,
      last: usage.last.get(item.id) ?? "",
      tagged: preferTopic != null && item.grammarTopic === preferTopic ? 0 : 1,
    }))
    .sort(
      (a, b) =>
        a.count - b.count ||
        a.tagged - b.tagged ||
        (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) ||
        a.index - b.index,
    )
    .map((r) => r.item);
}

export function pickBest(items, usage, preferTopic = null) {
  return rankItems(items, usage, preferTopic)[0] ?? null;
}

/** For "Pick another": the next item after `currentId` in ranked order (wraps). */
export function pickAfter(items, usage, currentId, preferTopic = null) {
  const ranked = rankItems(items, usage, preferTopic);
  const i = ranked.findIndex((item) => item.id === currentId);
  return ranked[(i + 1) % ranked.length] ?? null;
}

/** Deterministic item for a week (used for false friends): weekIndex * perWeek … */
export function itemsForWeek(items, weekIndex, perWeek = 2) {
  if (!items.length) return [];
  const n = items.length;
  const start = (((weekIndex * perWeek) % n) + n) % n;
  return Array.from({ length: Math.min(perWeek, n) }, (_, k) => items[(start + k) % n]);
}
