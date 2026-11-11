// Loading and validating the hand-edited JSON files in data/.
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

const isPosInt = (n) => Number.isInteger(n) && n > 0;
const isHHMM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));

/** Returns a list of human-readable problems; empty means valid. */
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
  return errors;
}

export function validateLink(link, where) {
  const errors = [];
  if (!link?.label) errors.push(`${where}.label is missing`);
  try {
    const u = new URL(link?.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch {
    errors.push(`${where}.url is not a valid http(s) URL`);
  }
  return errors;
}

export async function loadConfig() {
  const file = "data/config.json";
  const config = await loadJSON(file);
  const errors = validateConfig(config);
  if (errors.length) throw new ContentError(file, errors.join("; "));
  return config;
}
