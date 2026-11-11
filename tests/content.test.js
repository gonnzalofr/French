// Validates the hand-edited files in data/. Run after editing: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTENT_FILES,
  grammarSearchUrl,
  parseJSON,
  validateConfig,
  validateContent,
  validatePrompts,
} from "../js/content.js";

const read = (file) =>
  parseJSON(file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const content = Object.fromEntries(CONTENT_FILES.map(({ key, file }) => [key, read(file)]));

test("data/config.json is valid", () => {
  assert.deepEqual(validateConfig(read("data/config.json")), []);
});

for (const { file } of CONTENT_FILES) {
  test(`${file} is valid`, () => {
    const problem = validateContent(content).find((p) => p.file === file);
    assert.deepEqual(problem?.errors ?? [], []);
  });
}

test("there is enough content for the rotation", () => {
  assert.ok(content.grammar.topics.length >= 12, "at least 12 grammar topics");
  assert.ok(content.speaking.items.length >= 14, "at least 14 speaking prompts");
  assert.ok(content.writing.items.length >= 14, "at least 14 writing prompts");
});

test("validateConfig reports readable problems", () => {
  const bad = {
    schemaVersion: 1,
    startDate: "2026-13-01",
    sessionStart: "5:30pm",
    blocks: { anki: { minutes: 10 } },
    focusByWeekday: { mon: "grammar" },
    anki: { links: [{ label: "x", url: "not a url" }] },
    correctionPrompt: ["no placeholder"],
  };
  const errors = validateConfig(bad);
  for (const prefix of ["startDate", "sessionStart", "blocks.listening", "focusByWeekday.mon", "anki.links[0].url", "correctionPrompt"]) {
    assert.ok(errors.some((e) => e.startsWith(prefix)), prefix);
  }
});

test("prompt validation catches duplicate ids and unknown grammar topics", () => {
  const errors = validatePrompts(
    { items: [{ id: "a", prompt: "x" }, { id: "a", prompt: "y", grammarTopic: "nope" }] },
    new Set(["real-topic"]),
  );
  assert.ok(errors.some((e) => e.includes("used twice")));
  assert.ok(errors.some((e) => e.includes('"nope"')));
});

test("broken JSON names the file and line", () => {
  assert.throws(
    () => parseJSON("data/x.json", '{\n  "a": 1,\n}'),
    (err) => err.message.startsWith("data/x.json:") && /line 3/.test(err.message),
  );
});

test("grammar links are site-restricted searches", () => {
  const url = grammarSearchUrl(content.grammar, { url: "https://www.lawlessfrench.com" }, "y en");
  assert.equal(url, "https://www.google.com/search?q=site%3Alawlessfrench.com%20y%20en");
});
