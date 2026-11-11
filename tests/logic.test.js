// Unit tests for the pure logic: storage, rotation, day records, streaks, timers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTENT_FILES, parseJSON } from "../js/content.js";
import { createStore, emptyState, makeBackup, migrate, parseBackup, STORAGE_KEY } from "../js/storage.js";
import { itemsForWeek, pickAfter, pickBest, rankItems, usageBefore } from "../js/picks.js";
import {
  buildCorrectionPrompt,
  countWords,
  currentTopic,
  ensureDay,
  hasActivity,
  parseWords,
  setGrammarVerdict,
  splitWord,
  topicStatus,
} from "../js/day.js";
import { calendarWeeks, collectWords, currentStreak, longestStreak, weekSummary, wordsToAnki } from "../js/streak.js";
import { formatMs, pauseTimer, remainingMs, startTimer } from "../js/timer.js";
import { recordingsToPrune } from "../js/recordings.js";
import { addDaysIso, daysBetween, focusForDate, parseLocalDate, weekStartIso } from "../js/schedule.js";

const read = (file) => parseJSON(file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const config = read("data/config.json");
const content = Object.fromEntries(CONTENT_FILES.map(({ key, file }) => [key, read(file)]));

function memoryBackend(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const completeDay = (focusType = "speaking") => ({
  focusType,
  blocks: { anki: { done: true }, listening: { done: true, words: [] }, focus: { done: true }, log: {} },
});

// ---------- storage ----------

test("store starts empty and round-trips through the backend", () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  store.load();
  assert.deepEqual(store.state, emptyState());
  store.state.days["2026-11-16"] = completeDay();
  assert.ok(store.save());
  const again = createStore(backend);
  again.load();
  assert.equal(again.state.days["2026-11-16"].focusType, "speaking");
});

test("corrupt saved data is kept aside, not lost", () => {
  const backend = memoryBackend({ [STORAGE_KEY]: "{not json" });
  const store = createStore(backend);
  store.load();
  assert.deepEqual(store.state.days, {});
  assert.match(store.warning, /couldn't be read/);
  const kept = [...backend.data.keys()].find((k) => k.startsWith(`${STORAGE_KEY}.unreadable-`));
  assert.equal(backend.data.get(kept), "{not json");
});

test("migrate fills missing fields and refuses newer versions", () => {
  const m = migrate({ days: { "2026-11-16": {} }, settings: { chime: false } });
  assert.equal(m.settings.chime, false);
  assert.equal(m.settings.keepRecordingsDays, 14);
  assert.equal(m.grammar.currentIndex, 0);
  assert.throws(() => migrate({ schemaVersion: 99 }));
  assert.deepEqual(migrate(null), emptyState());
});

test("backups round-trip and reject other files", () => {
  const state = emptyState();
  state.days["2026-11-16"] = completeDay();
  const text = JSON.stringify(makeBackup(state, [], new Date("2026-11-20T10:00:00Z")));
  const parsed = parseBackup(text);
  assert.equal(parsed.exportedAt, "2026-11-20T10:00:00.000Z");
  assert.ok(parsed.state.days["2026-11-16"]);
  assert.throws(() => parseBackup('{"hello":1}'), /isn't a French Daily backup/);
  assert.throws(() => parseBackup("nope"), /isn't valid JSON/);
});

// ---------- rotation ----------

const items = [{ id: "a" }, { id: "b", grammarTopic: "t1" }, { id: "c" }];

test("least-used item wins, then tagged, then oldest, then file order", () => {
  const none = { counts: new Map(), last: new Map() };
  assert.equal(pickBest(items, none).id, "a");
  assert.equal(pickBest(items, none, "t1").id, "b");
  const used = { counts: new Map([["a", 1]]), last: new Map([["a", "2026-11-16"]]) };
  assert.equal(pickBest(items, used).id, "b");
  const allOnce = {
    counts: new Map([["a", 1], ["b", 1], ["c", 1]]),
    last: new Map([["a", "2026-11-18"], ["b", "2026-11-17"], ["c", "2026-11-16"]]),
  };
  assert.deepEqual(rankItems(items, allOnce).map((i) => i.id), ["c", "b", "a"]);
});

test("pick another cycles through the ranked list", () => {
  const none = { counts: new Map(), last: new Map() };
  assert.equal(pickAfter(items, none, "a").id, "b");
  assert.equal(pickAfter(items, none, "c").id, "a");
});

test("usage only counts days before the given date", () => {
  const days = { "2026-11-16": { x: "a" }, "2026-11-17": { x: "b" }, "2026-11-18": { x: "a" } };
  const u = usageBefore(days, "2026-11-18", (d) => d.x);
  assert.equal(u.counts.get("a"), 1);
  assert.equal(u.last.get("b"), "2026-11-17");
});

test("itemsForWeek wraps around the list", () => {
  assert.deepEqual(itemsForWeek(items, 1, 2).map((i) => i.id), ["c", "a"]);
  assert.deepEqual(itemsForWeek(items, -1, 2).map((i) => i.id), ["b", "c"]);
});

// ---------- day records ----------

test("ensureDay fills picks that match the weekday", () => {
  const state = emptyState();
  const tue = ensureDay(state, "2026-11-17", { config, content });
  assert.equal(tue.focusType, "speaking");
  assert.ok(tue.blocks.focus.promptId.startsWith("sp-"));
  assert.ok(tue.blocks.focus.drillId);
  assert.ok(tue.blocks.listening.itemId);
  // First grammar topic is pc-vs-imparfait, so a prompt tagged with it is preferred.
  assert.equal(tue.blocks.focus.promptId, "sp-weekend");

  const wed = ensureDay(state, "2026-11-18", { config, content });
  assert.ok(wed.blocks.focus.promptId.startsWith("wr-"));
  const mon = ensureDay(state, "2026-11-16", { config, content });
  assert.equal(mon.blocks.focus.grammarTopic, "pc-vs-imparfait");
});

test("a completed prompt isn't picked again next time", () => {
  const state = emptyState();
  const first = ensureDay(state, "2026-11-17", { config, content });
  first.blocks.focus.done = true;
  const second = ensureDay(state, "2026-11-20", { config, content });
  assert.notEqual(second.blocks.focus.promptId, first.blocks.focus.promptId);
});

test("a day previewed in advance gets fresh picks when it arrives, unless it was used", () => {
  const state = emptyState();
  // On Wed 11 Nov you peek at Mon 16 Nov: it gets topic 1.
  ensureDay(state, "2026-11-16", { config, content, todayIso: "2026-11-11" });
  assert.equal(state.days["2026-11-16"].blocks.focus.grammarTopic, content.grammar.topics[0].id);
  // Thursday's verdict moves the course on.
  ensureDay(state, "2026-11-12", { config, content, todayIso: "2026-11-12" });
  setGrammarVerdict(state, "2026-11-12", "got-it", content);
  // When Monday arrives, the untouched preview is re-picked.
  const mon = ensureDay(state, "2026-11-16", { config, content, todayIso: "2026-11-16" });
  assert.equal(mon.blocks.focus.grammarTopic, content.grammar.topics[1].id);
  // A day you actually worked on keeps its picks.
  const tue = ensureDay(state, "2026-11-17", { config, content, todayIso: "2026-11-11" });
  tue.blocks.anki.done = true;
  const promptId = tue.blocks.focus.promptId;
  state.grammar.currentIndex = 5;
  assert.equal(ensureDay(state, "2026-11-17", { config, content, todayIso: "2026-11-17" }).blocks.focus.promptId, promptId);
});

test("week summary marks days before the start date instead of calling them missed", () => {
  const week = weekSummary({}, "2026-11-15", (iso) => focusForDate(parseLocalDate(iso), config), "2026-11-11");
  assert.deepEqual(week.map((w) => w.beforeStart), [true, true, false, false, false, false]);
});

test("Thursday 'got it' advances the topic; undoing it goes back", () => {
  const state = emptyState();
  ensureDay(state, "2026-11-19", { config, content });
  setGrammarVerdict(state, "2026-11-19", "got-it", content);
  assert.equal(currentTopic(state, content).topic.id, content.grammar.topics[1].id);
  assert.equal(topicStatus(state)["pc-vs-imparfait"], "mastered");
  setGrammarVerdict(state, "2026-11-19", "again", content);
  assert.equal(state.grammar.currentIndex, 0);
  assert.equal(topicStatus(state)["pc-vs-imparfait"], "again");
  // Next Monday picks up the new position.
  setGrammarVerdict(state, "2026-11-19", "got-it", content);
  const mon = ensureDay(state, "2026-11-23", { config, content });
  assert.equal(mon.blocks.focus.grammarTopic, content.grammar.topics[1].id);
});

test("topics wrap around into a second round", () => {
  const state = emptyState();
  state.grammar.currentIndex = content.grammar.topics.length;
  const { topic, round } = currentTopic(state, content);
  assert.equal(topic.id, content.grammar.topics[0].id);
  assert.equal(round, 2);
});

test("words parsing, splitting and Anki export", () => {
  assert.deepEqual(parseWords("  un chantier = construction site \n\n avoir du mal à\r\n"), [
    "un chantier = construction site",
    "avoir du mal à",
  ]);
  assert.deepEqual(splitWord("un chantier = construction site"), { front: "un chantier", back: "construction site" });
  assert.deepEqual(splitWord("avoir du mal à"), { front: "avoir du mal à", back: "" });
  const tsv = wordsToAnki([{ entry: "un chantier = site" }, { entry: "Un chantier = dup" }, { entry: "bof" }]);
  assert.equal(tsv, "un chantier\tsite\nbof\t");
});

test("word count handles elisions and accents", () => {
  assert.equal(countWords("Aujourd'hui, l'élève est allé à l'école."), 6);
  assert.equal(countWords("   "), 0);
});

test("correction prompt fills its placeholders", () => {
  const out = buildCorrectionPrompt(config.correctionPrompt, { prompt: "P", grammar: "G", text: "  Bonjour  " });
  assert.match(out, /Writing prompt: P/);
  assert.match(out, /studying: G/);
  assert.match(out, /"""\nBonjour\n"""/);
});

test("hasActivity ignores untouched days", () => {
  const state = emptyState();
  const day = ensureDay(state, "2026-11-17", { config, content });
  assert.equal(hasActivity(day), false);
  day.blocks.listening.words = ["mot"];
  assert.equal(hasActivity(day), true);
});

// ---------- streaks & stats ----------

test("streak counts back from today, and yesterday's streak survives until midnight", () => {
  const days = {
    "2026-11-14": completeDay(),
    "2026-11-15": completeDay(),
    "2026-11-16": completeDay(),
  };
  assert.equal(currentStreak(days, "2026-11-16"), 3);
  assert.equal(currentStreak(days, "2026-11-17"), 3, "today not done yet: still alive");
  assert.equal(currentStreak(days, "2026-11-18"), 0, "missed a whole day: reset");
  days["2026-11-17"] = { blocks: { anki: { done: true }, listening: { done: true }, focus: { done: false } } };
  assert.equal(currentStreak(days, "2026-11-17"), 3, "partial day doesn't add");
});

test("longest streak spans month boundaries and ignores gaps", () => {
  const days = {
    "2026-10-30": completeDay(),
    "2026-10-31": completeDay(),
    "2026-11-01": completeDay(),
    "2026-11-03": completeDay(),
  };
  assert.equal(longestStreak(days), 3);
  assert.equal(longestStreak({}), 0);
});

test("week summary covers Monday–Saturday and flags missing blocks", () => {
  const days = { "2026-11-16": completeDay("grammar-learn") };
  const week = weekSummary(days, "2026-11-22", (iso) => focusForDate(parseLocalDate(iso), config));
  assert.equal(week.length, 6);
  assert.equal(week[0].done, 3);
  assert.deepEqual(week[1].missing, ["anki", "listening", "focus"]);
  assert.equal(week[1].focusType, "speaking");
});

test("collectWords filters by date range", () => {
  const days = {
    "2026-11-15": { blocks: { listening: { words: ["old"] } } },
    "2026-11-16": { blocks: { listening: { words: ["a", "b"] } } },
  };
  assert.deepEqual(collectWords(days, "2026-11-16", "2026-11-22").map((w) => w.entry), ["a", "b"]);
});

test("calendar weeks end with the current week and start on Mondays", () => {
  const weeks = calendarWeeks("2026-11-18", 12);
  assert.equal(weeks.length, 12);
  assert.equal(weeks.at(-1)[0], "2026-11-16");
  assert.ok(weeks.every((w) => parseLocalDate(w[0]).getDay() === 1));
});

// ---------- dates & timers ----------

test("date helpers survive DST and month ends", () => {
  assert.equal(addDaysIso("2026-10-24", 2), "2026-10-26"); // EU DST ends 25 Oct
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(weekStartIso("2026-11-22"), "2026-11-16");
  assert.equal(weekStartIso("2026-11-16"), "2026-11-16");
});

test("timer math is timestamp based", () => {
  const t0 = { remainingMs: 60_000, runningSince: null };
  const running = startTimer(t0, 1_000);
  assert.equal(remainingMs(running, 31_000), 30_000);
  const paused = pauseTimer(running, 41_000);
  assert.deepEqual(paused, { remainingMs: 20_000, runningSince: null });
  assert.equal(remainingMs(running, 999_999), 0);
  assert.equal(formatMs(25 * 60_000), "25:00");
  assert.equal(formatMs(61_001), "01:02");
});

test("recordings older than the keep window are pruned unless starred", () => {
  const recs = [
    { id: "1", date: "2026-11-01", starred: false },
    { id: "2", date: "2026-11-01", starred: true },
    { id: "3", date: "2026-11-10", starred: false },
  ];
  assert.deepEqual(recordingsToPrune(recs, 14, "2026-11-20").map((r) => r.id), ["1"]);
});
