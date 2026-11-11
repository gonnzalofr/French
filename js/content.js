// Loading and validating the hand-edited JSON files in data/.
// Every validator is pure and returns a list of readable problems (empty = valid),
// so the same checks run in the browser and in `npm test`.
import { BLOCK_ORDER, FOCUS_TYPES, WEEKDAY_KEYS, parseLocalDate } from "./schedule.js";

export class ContentError extends Error {
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.name = "ContentError";
    this.file = file;
  }
}

/** Turn "…at position 123…" from JSON.parse into "line X, column Y". */
export function describeJSONError(text, err) {
  const pos = /position (\d+)/.exec(err.message);
  // Newer engines already include "(line X column Y)"; don't repeat it.
  if (!pos || /line \d+/.test(err.message)) return `invalid JSON: ${err.message}`;
  const before = text.slice(0, Number(pos[1]));
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  return `invalid JSON near line ${line}, column ${column} (${err.message})`;
}

export function parseJSON(file, text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ContentError(file, describeJSONError(text, err));
  }
}

export async function loadJSON(file) {
  let res;
  try {
    // no-store: edits to data files show up on a plain reload.
    res = await fetch(file, { cache: "no-store" });
  } catch {
    throw new ContentError(file, "could not be fetched. Is the local server running?");
  }
  if (!res.ok) throw new ContentError(file, `HTTP ${res.status} (missing file?)`);
  return parseJSON(file, await res.text());
}

// ---------- small checkers ----------

const isPosInt = (n) => Number.isInteger(n) && n > 0;
const isHHMM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const isNonEmptyString = (s) => typeof s === "string" && s.trim() !== "";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateLink(link, where) {
  const errors = [];
  if (!isNonEmptyString(link?.label)) errors.push(`${where}.label is missing`);
  if (!isHttpUrl(link?.url)) errors.push(`${where}.url is not a valid http(s) URL`);
  if (link?.verify !== undefined && typeof link.verify !== "boolean") {
    errors.push(`${where}.verify must be true or false`);
  }
  return errors;
}

/** Checks a list of items: unique kebab-case ids + required string fields. */
function checkItems(list, where, required) {
  const errors = [];
  if (!Array.isArray(list) || list.length === 0) return [`${where} must be a non-empty list`];
  const seen = new Set();
  list.forEach((item, i) => {
    const at = `${where}[${i}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(item.id))) {
      errors.push(`${at}.id must be kebab-case, e.g. "my-item"`);
    } else if (seen.has(item.id)) {
      errors.push(`${at}.id "${item.id}" is used twice`);
    }
    seen.add(item.id);
    for (const field of required) {
      if (!isNonEmptyString(item[field])) errors.push(`${at}.${field} is missing`);
    }
    if (item.level !== undefined && !LEVELS.includes(item.level)) {
      errors.push(`${at}.level must be one of ${LEVELS.join(", ")}`);
    }
  });
  return errors;
}

// ---------- per-file validators ----------

export function validateConfig(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["config must be a JSON object"];
  if (c.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!parseLocalDate(c.startDate)) errors.push("startDate must be a real date as YYYY-MM-DD");
  if (!isHHMM(c.sessionStart)) errors.push('sessionStart must look like "17:30"');

  for (const key of BLOCK_ORDER) {
    if (!isPosInt(c.blocks?.[key]?.minutes)) {
      errors.push(`blocks.${key}.minutes must be a positive whole number`);
    }
  }
  for (const day of WEEKDAY_KEYS) {
    const focus = c.focusByWeekday?.[day];
    if (!(focus in FOCUS_TYPES)) {
      errors.push(
        `focusByWeekday.${day} must be one of: ${Object.keys(FOCUS_TYPES).join(", ")}`,
      );
    }
  }
  const links = c.anki?.links;
  if (!Array.isArray(links) || links.length === 0) {
    errors.push("anki.links must be a non-empty list");
  } else {
    links.forEach((l, i) => errors.push(...validateLink(l, `anki.links[${i}]`)));
  }
  if (c.correctionPrompt !== undefined) {
    const lines = c.correctionPrompt;
    if (!Array.isArray(lines) || !lines.every((l) => typeof l === "string")) {
      errors.push("correctionPrompt must be a list of text lines");
    } else if (!lines.some((l) => l.includes("{text}"))) {
      errors.push("correctionPrompt must contain {text} somewhere");
    }
  }
  return errors;
}

const PODCAST_TYPES = ["podcast", "youtube", "radio", "show"];

export function validatePodcasts(p) {
  const errors = checkItems(p?.items, "items", ["name", "url"]);
  (p?.items ?? []).forEach((item, i) => {
    if (item?.url && !isHttpUrl(item.url)) errors.push(`items[${i}].url is not a valid URL`);
    if (!PODCAST_TYPES.includes(item?.type)) {
      errors.push(`items[${i}].type must be one of ${PODCAST_TYPES.join(", ")}`);
    }
  });
  return errors;
}

export function validateGrammar(g) {
  const errors = [];
  if (!isHttpUrl(g?.searchUrl)) errors.push("searchUrl must be a URL");
  for (const kind of ["learn", "drill"]) {
    const sites = g?.sites?.[kind];
    if (!Array.isArray(sites) || sites.length === 0) errors.push(`sites.${kind} must be a non-empty list`);
    else sites.forEach((s, i) => errors.push(...validateLink(s, `sites.${kind}[${i}]`)));
  }
  errors.push(...checkItems(g?.topics, "topics", ["title", "query", "summary"]));
  (g?.topics ?? []).forEach((t, i) => {
    if (t?.keyPoints !== undefined && !(Array.isArray(t.keyPoints) && t.keyPoints.every(isNonEmptyString))) {
      errors.push(`topics[${i}].keyPoints must be a list of text`);
    }
    (t?.examples ?? []).forEach((ex, j) => {
      if (!isNonEmptyString(ex?.fr)) errors.push(`topics[${i}].examples[${j}].fr is missing`);
    });
    for (const kind of ["learn", "drill"]) {
      (t?.[kind] ?? []).forEach((l, j) => errors.push(...validateLink(l, `topics[${i}].${kind}[${j}]`)));
    }
  });
  return errors;
}

export function validatePrompts(p, grammarIds = null) {
  const errors = checkItems(p?.items, "items", ["prompt"]);
  (p?.items ?? []).forEach((item, i) => {
    if (item?.grammarTopic !== undefined && grammarIds && !grammarIds.has(item.grammarTopic)) {
      errors.push(`items[${i}].grammarTopic "${item.grammarTopic}" is not an id in grammar.json`);
    }
    if (item?.targetWords !== undefined && !isPosInt(item.targetWords)) {
      errors.push(`items[${i}].targetWords must be a positive whole number`);
    }
  });
  return errors;
}

export function validatePronunciation(p) {
  const errors = [];
  if (typeof p?.audioUrl !== "string" || !p.audioUrl.includes("{word}") || !isHttpUrl(p.audioUrl.replace("{word}", "x"))) {
    errors.push('audioUrl must be a URL containing "{word}"');
  }
  errors.push(...checkItems(p?.drills, "drills", ["title", "tip"]));
  (p?.drills ?? []).forEach((d, i) => {
    if (!Array.isArray(d?.words) || d.words.length === 0 || !d.words.every(isNonEmptyString)) {
      errors.push(`drills[${i}].words must be a non-empty list of words`);
    }
  });
  return errors;
}

export function validateFalseFriends(f) {
  const errors = checkItems(f?.items, "items", ["fr", "means", "trap"]);
  (f?.items ?? []).forEach((item, i) => {
    if (!["en", "es"].includes(item?.with)) errors.push(`items[${i}].with must be "en" or "es"`);
  });
  return errors;
}

export function validateResources(r) {
  if (!Array.isArray(r?.links) || r.links.length === 0) return ["links must be a non-empty list"];
  return r.links.flatMap((l, i) => validateLink(l, `links[${i}]`));
}

/** All content files, their key in the content object, and their validator. */
export const CONTENT_FILES = [
  { key: "podcasts", file: "data/podcasts.json", validate: validatePodcasts },
  { key: "grammar", file: "data/grammar.json", validate: validateGrammar },
  { key: "speaking", file: "data/speaking-prompts.json", validate: validatePrompts, needsGrammar: true },
  { key: "writing", file: "data/writing-prompts.json", validate: validatePrompts, needsGrammar: true },
  { key: "pronunciation", file: "data/pronunciation.json", validate: validatePronunciation },
  { key: "falseFriends", file: "data/false-friends.json", validate: validateFalseFriends },
  { key: "resources", file: "data/resources.json", validate: validateResources },
];

/** Validate a whole content object (after loading). Returns [{file, errors}] with problems only. */
export function validateContent(content) {
  const grammarIds = new Set((content.grammar?.topics ?? []).map((t) => t.id));
  return CONTENT_FILES.map(({ key, file, validate, needsGrammar }) => ({
    file,
    errors: validate(content[key], needsGrammar ? grammarIds : undefined),
  })).filter((r) => r.errors.length);
}

export async function loadConfig() {
  const file = "data/config.json";
  const config = await loadJSON(file);
  const errors = validateConfig(config);
  if (errors.length) throw new ContentError(file, errors.join("; "));
  return config;
}

export async function loadContent() {
  const entries = await Promise.all(
    CONTENT_FILES.map(async ({ key, file }) => [key, await loadJSON(file)]),
  );
  const content = Object.fromEntries(entries);
  const problems = validateContent(content);
  if (problems.length) {
    const { file, errors } = problems[0];
    throw new ContentError(file, errors.slice(0, 5).join("; ") + (errors.length > 5 ? " …" : ""));
  }
  return content;
}

/** Fast lookup helper: content.byId("speaking", "sp-weekend"). */
export function findById(list, id) {
  return list.find((item) => item.id === id) ?? null;
}

/** Site-restricted search link for a grammar topic. */
export function grammarSearchUrl(grammar, site, query) {
  const host = new URL(site.url).host.replace(/^www\./, "");
  return grammar.searchUrl + encodeURIComponent(`site:${host} ${query}`);
}

export function audioUrl(pronunciation, word) {
  return pronunciation.audioUrl.replace("{word}", encodeURIComponent(word));
}
