// Your personal list of recurring mistakes, and a spaced quiz over it. Pure.
//
// Each mistake: { id, wrong, right, note, source, added, lastMade, count,
//                 streak, lastQuizzed, mastered }
// A mistake is "mastered" after MASTERED_AFTER correct answers on different days.
// Making the same mistake again brings it back.

export const MASTERED_AFTER = 3;

/** Compare answers leniently: case, curly vs straight apostrophes, punctuation, spacing. */
export function normalizeAnswer(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»"“”.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
let seq = 0;
const defaultId = () => `m-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Add a mistake, or bump the existing one if it's the same wrong → right pair.
 * @returns the stored mistake, or null if there was nothing to add
 */
export function addMistake(list, { wrong, right, note = "", source = "manual" }, iso, makeId = defaultId) {
  wrong = tidy(wrong);
  right = tidy(right);
  note = tidy(note);
  if (!right || normalizeAnswer(wrong) === normalizeAnswer(right)) return null;
  const same = (m) =>
    normalizeAnswer(m.right) === normalizeAnswer(right) && normalizeAnswer(m.wrong) === normalizeAnswer(wrong);
  const existing = list.find(same);
  if (existing) {
    existing.count = (existing.count ?? 1) + 1;
    existing.lastMade = iso;
    existing.streak = 0;
    existing.mastered = false;
    if (note && !existing.note) existing.note = note;
    return existing;
  }
  const m = {
    id: makeId(),
    wrong,
    right,
    note,
    source,
    added: iso,
    lastMade: iso,
    count: 1,
    streak: 0,
    lastQuizzed: null,
    mastered: false,
  };
  list.push(m);
  return m;
}

/** Up to `n` active mistakes to quiz today: weakest and longest-unseen first. */
export function pickQuiz(list, n, iso) {
  return list
    .filter((m) => !m.mastered && m.lastQuizzed !== iso)
    .sort(
      (a, b) =>
        a.streak - b.streak ||
        (a.lastQuizzed ?? "").localeCompare(b.lastQuizzed ?? "") ||
        (b.count ?? 1) - (a.count ?? 1) ||
        a.added.localeCompare(b.added),
    )
    .slice(0, n);
}

/**
 * Grade a quiz answer. The streak moves at most once per day, so mastering
 * something needs correct answers on three different days.
 */
export function gradeAnswer(m, answer, iso) {
  const ok = normalizeAnswer(answer) === normalizeAnswer(m.right);
  if (m.lastQuizzed !== iso) m.streak = ok ? m.streak + 1 : 0;
  else if (!ok) m.streak = 0;
  m.lastQuizzed = iso;
  m.mastered = m.streak >= MASTERED_AFTER;
  return ok;
}

const stripQuotes = (s) => tidy(s).replace(/^[«"“'‘]+\s*|\s*[»"”'’]+$/g, "").trim();

/**
 * Read "original → correction — explanation" lines (the format the correction
 * prompt asks Claude for) into mistakes. Bullets, numbering and markdown are ignored.
 */
export function parseCorrections(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/[*_`]/g, "")
      .trim();
    const m = /^(.*?)\s*(?:→|->|=>)\s*(.+)$/.exec(line);
    if (!m) continue;
    const rest = m[2];
    const sep = /\s+[—–-]\s+|:\s+|\s+\(/.exec(rest);
    const right = stripQuotes(sep ? rest.slice(0, sep.index) : rest);
    const note = sep ? tidy(rest.slice(sep.index + sep[0].length)).replace(/\)$/, "") : "";
    const wrong = stripQuotes(m[1]);
    if (wrong && right) out.push({ wrong, right, note });
  }
  return out;
}

export function mistakeStats(list) {
  const mastered = list.filter((m) => m.mastered).length;
  return { total: list.length, mastered, active: list.length - mastered };
}
