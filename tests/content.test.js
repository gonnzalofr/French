// Validates the hand-edited files in data/. Run after editing: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJSON, validateConfig } from "../js/content.js";

const read = (name) =>
  parseJSON(`data/${name}`, readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));

test("data/config.json is valid", () => {
  assert.deepEqual(validateConfig(read("config.json")), []);
});

test("validateConfig reports readable problems", () => {
  const bad = {
    schemaVersion: 1,
    startDate: "2026-13-01",
    sessionStart: "5:30pm",
    blocks: { anki: { minutes: 10 } },
    focusByWeekday: { mon: "grammar" },
    anki: { links: [{ label: "x", url: "not a url" }] },
  };
  const errors = validateConfig(bad);
  assert.ok(errors.some((e) => e.startsWith("startDate")));
  assert.ok(errors.some((e) => e.startsWith("sessionStart")));
  assert.ok(errors.some((e) => e.startsWith("blocks.listening")));
  assert.ok(errors.some((e) => e.startsWith("focusByWeekday.mon")));
  assert.ok(errors.some((e) => e.startsWith("anki.links[0].url")));
});

test("broken JSON names the file and line", () => {
  assert.throws(
    () => parseJSON("data/x.json", '{\n  "a": 1,\n}'),
    (err) => err.message.startsWith("data/x.json:") && /line 3/.test(err.message),
  );
});
