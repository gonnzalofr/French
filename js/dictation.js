// Dictation (dictée) checking: word-level diff between the sentence and what you typed. Pure.

/** Split into words, ignoring punctuation but keeping apostrophes and hyphens inside words. */
export function tokenize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»"“”.,!?;:()…]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * Align expected and typed words (LCS). Returns ops in reading order:
 *   {type:"same", expected, typed} | {type:"wrong", expected, typed}
 *   {type:"missing", expected}      | {type:"extra", typed}
 * A missing word directly followed by an extra one (or vice versa) becomes "wrong".
 */
export function diffWords(expectedText, typedText) {
  const a = tokenize(expectedText);
  const b = tokenize(typedText);
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = same(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const raw = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(a[i], b[j])) {
      raw.push({ type: "same", expected: a[i++], typed: b[j++] });
    } else if (j < m && (i === n || L[i][j + 1] > L[i + 1][j])) {
      raw.push({ type: "extra", typed: b[j++] });
    } else {
      raw.push({ type: "missing", expected: a[i++] });
    }
  }
  // Within each run of non-matching words, pair missing and extra words in order:
  // "vues étaient" vs "vu etaient" → two substitutions, not two misses + two extras.
  const ops = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === "same") {
      ops.push(raw[k++]);
      continue;
    }
    const missing = [];
    const extra = [];
    while (k < raw.length && raw[k].type !== "same") {
      (raw[k].type === "missing" ? missing : extra).push(raw[k]);
      k++;
    }
    const pairs = Math.min(missing.length, extra.length);
    for (let p = 0; p < pairs; p++) ops.push({ type: "wrong", expected: missing[p].expected, typed: extra[p].typed });
    ops.push(...missing.slice(pairs), ...extra.slice(pairs));
  }
  return ops;
}

export function scoreDiff(ops) {
  const total = ops.filter((o) => o.type !== "extra").length;
  const correct = ops.filter((o) => o.type === "same").length;
  return { correct, total, perfect: correct === total && ops.every((o) => o.type === "same") };
}
