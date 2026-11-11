import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addMinutes,
  currentBlockKey,
  focusForDate,
  parseLocalDate,
  sessionPlan,
  toLocalISODate,
  totalMinutes,
} from "../js/schedule.js";

const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));

test("each weekday maps to the right focus block", () => {
  // 2026-11-16 is a Monday.
  const expected = [
    ["2026-11-16", "grammar-learn"],
    ["2026-11-17", "speaking"],
    ["2026-11-18", "writing"],
    ["2026-11-19", "grammar-drill"],
    ["2026-11-20", "speaking"],
    ["2026-11-21", "writing"],
    ["2026-11-22", "review"],
  ];
  for (const [iso, focus] of expected) {
    assert.equal(focusForDate(parseLocalDate(iso), config), focus, iso);
  }
});

test("session plan runs 17:30–18:30 in four ordered blocks", () => {
  const plan = sessionPlan(parseLocalDate("2026-11-17"), config);
  assert.deepEqual(
    plan.map((b) => [b.key, b.start, b.end]),
    [
      ["anki", "17:30", "17:40"],
      ["listening", "17:40", "18:05"],
      ["focus", "18:05", "18:25"],
      ["log", "18:25", "18:30"],
    ],
  );
  assert.equal(plan[2].focusType, "speaking");
  assert.equal(totalMinutes(config), 60);
});

test("addMinutes wraps around midnight", () => {
  assert.equal(addMinutes("23:50", 20), "00:10");
  assert.equal(addMinutes("00:05", -10), "23:55");
});

test("local dates round-trip and reject impossible dates", () => {
  assert.equal(toLocalISODate(parseLocalDate("2026-02-28")), "2026-02-28");
  assert.equal(parseLocalDate("2026-02-30"), null);
  assert.equal(parseLocalDate("16/11/2026"), null);
  assert.equal(parseLocalDate(null), null);
});

test("evening session date is the local date, not UTC", () => {
  const evening = new Date(2026, 10, 16, 23, 59);
  assert.equal(toLocalISODate(evening), "2026-11-16");
});

test("currentBlockKey finds the block the clock is in", () => {
  const plan = sessionPlan(parseLocalDate("2026-11-16"), config);
  const at = (h, m) => new Date(2026, 10, 16, h, m);
  assert.equal(currentBlockKey(plan, at(17, 29)), null);
  assert.equal(currentBlockKey(plan, at(17, 30)), "anki");
  assert.equal(currentBlockKey(plan, at(18, 4)), "listening");
  assert.equal(currentBlockKey(plan, at(18, 29)), "log");
  assert.equal(currentBlockKey(plan, at(18, 30)), null);
});
