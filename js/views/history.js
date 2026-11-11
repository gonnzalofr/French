import { h, actionButton, copyText, downloadFile, tag } from "../dom.js";
import { findById } from "../content.js";
import { coreDoneCount, hasActivity } from "../day.js";
import {
  calendarWeeks,
  collectWords,
  currentStreak,
  isComplete,
  longestStreak,
  totals,
  wordsToAnki,
} from "../streak.js";
import { FOCUS_TYPES, addDaysIso, parseLocalDate, toLocalISODate, weekStartIso } from "../schedule.js";
import { capitalize } from "./today.js";

const shortDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export function renderHistory({ store, content }) {
  const { days } = store.state;
  const todayIso = toLocalISODate(new Date());
  const t = totals(days);

  const stats = h(
    "div",
    { class: "stats" },
    stat(currentStreak(days, todayIso), "day streak"),
    stat(longestStreak(days), "longest streak"),
    stat(t.sessions, t.sessions === 1 ? "full session" : "full sessions"),
    stat(t.words, t.words === 1 ? "word noted" : "words noted"),
  );

  return h(
    "section",
    { class: "view", "aria-labelledby": "history-title" },
    h("header", { class: "view-head" }, h("h2", { id: "history-title" }, "History")),
    stats,
    calendar(days, todayIso),
    wordsExport(days, todayIso),
    dayList(days, content),
  );
}

function stat(value, label) {
  return h("div", { class: "stat" }, h("span", { class: "stat-value" }, value), h("span", { class: "stat-label" }, label));
}

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKS_SHOWN = 20;

function calendar(days, todayIso) {
  const weeks = calendarWeeks(todayIso, WEEKS_SHOWN);
  const status = (iso) =>
    iso > todayIso ? "future" : isComplete(days[iso]) ? "complete" : hasActivity(days[iso]) ? "partial" : "none";
  const label = { complete: "full session", partial: "partial", none: "no session", future: "" };

  // Month name above the first week that starts in a new month.
  // Skip a label that would crowd the previous one (e.g. a month that only
  // shows its last week in the first column).
  let prevMonth = null;
  let lastLabelled = -Infinity;
  const monthRow = weeks.map((week, col) => {
    const m = parseLocalDate(week[0]).getMonth();
    const isNew = m !== prevMonth;
    prevMonth = m;
    const room = col - lastLabelled >= 3 && (col > 0 || parseLocalDate(weeks[2][0]).getMonth() === m);
    if (!isNew || !room) return h("span", { class: "cal-month" });
    lastLabelled = col;
    return h("span", { class: "cal-month" }, monthFmt.format(parseLocalDate(week[0])).replace(".", ""));
  });

  const grid = h(
    "div",
    { class: "calendar", style: `--weeks:${WEEKS_SHOWN}` },
    h("span", { class: "cal-corner" }),
    monthRow,
    WEEKDAY_LETTERS.map((letter, row) => [
      h("span", { class: "cal-weekday", "aria-hidden": "true" }, row % 2 === 0 ? letter : ""),
      weeks.map((week) => {
        const iso = week[row];
        const s = status(iso);
        return s === "future"
          ? h("span", { class: "cal-day", "data-status": s, "aria-hidden": "true" })
          : h("a", {
              class: "cal-day",
              href: `#/today?date=${iso}`,
              "data-status": s,
              "data-today": iso === todayIso,
              title: `${iso}: ${label[s]}`,
              "aria-label": `${iso}: ${label[s]}`,
            });
      }),
    ]),
  );

  return h(
    "div",
    { class: "card" },
    h("h3", {}, `Last ${WEEKS_SHOWN} weeks`),
    grid,
    h(
      "p",
      { class: "legend muted" },
      h("span", { class: "cal-day", "data-status": "complete" }),
      " full session ",
      h("span", { class: "cal-day", "data-status": "partial" }),
      " partial ",
      h("span", { class: "cal-day", "data-status": "none" }),
      " none",
    ),
  );
}

function wordsExport(days, todayIso) {
  const weekFrom = weekStartIso(todayIso);
  const ranges = [
    { label: "This week", from: weekFrom },
    { label: "Last 30 days", from: addDaysIso(todayIso, -29) },
    { label: "All", from: "0000-01-01" },
  ];
  const count = (from) => collectWords(days, from, todayIso).length;
  return h(
    "div",
    { class: "card" },
    h("h3", {}, "Words for Anki"),
    h(
      "p",
      { class: "muted" },
      "Tab-separated front/back, one per line. In Anki: File → Import, pick the downloaded file, set the separator to Tab.",
    ),
    h(
      "div",
      { class: "export-rows" },
      ranges.map(({ label, from }) => {
        const n = count(from);
        return h(
          "div",
          { class: "row" },
          h("span", {}, `${label} `, h("span", { class: "muted" }, `(${n})`)),
          h(
            "span",
            { class: "row-end" },
            actionButton("Copy", () => copyText(wordsToAnki(collectWords(days, from, todayIso))), {
              className: "btn btn-small",
              doneLabel: "Copied ✓",
            }),
            " ",
            h(
              "button",
              {
                type: "button",
                class: "btn btn-small",
                disabled: n === 0,
                onclick: () =>
                  downloadFile(
                    `french-words-${todayIso}.txt`,
                    wordsToAnki(collectWords(days, from, todayIso)),
                    "text/plain;charset=utf-8",
                  ),
              },
              "Download",
            ),
          ),
        );
      }),
    ),
  );
}

function dayList(days, content) {
  const isos = Object.keys(days)
    .filter((iso) => hasActivity(days[iso]))
    .sort()
    .reverse();
  if (!isos.length) {
    return h("div", { class: "card" }, h("p", { class: "muted" }, "No sessions yet. Your first one will show up here."));
  }
  return h(
    "div",
    { class: "day-list" },
    h("h3", {}, "Sessions"),
    isos.map((iso) => dayEntry(iso, days[iso], content)),
  );
}

function dayEntry(iso, day, content) {
  const b = day.blocks;
  const F = b.focus ?? {};
  const done = coreDoneCount(day);
  const podcast = findById(content.podcasts.items, b.listening?.itemId);
  const promptList = day.focusType === "speaking" ? content.speaking.items : content.writing.items;
  const prompt = findById(promptList, F.promptId);
  const topic = findById(content.grammar.topics, F.grammarTopic);
  const ratings = F.rating ? Object.entries(F.rating).filter(([, v]) => v != null) : [];

  const rows = [
    ["Listening", podcast?.name],
    ["Words", b.listening?.words?.length ? b.listening.words.join(" · ") : null],
    ["Grammar", topic ? `${topic.title}${F.verdict ? ` (${F.verdict === "got-it" ? "got it" : "again"})` : ""}` : null],
    ["Prompt", prompt?.prompt],
    ["Ratings", ratings.length ? ratings.map(([k, v]) => `${k} ${v}/5`).join(", ") : null],
    ["Dictée", F.dictation?.length ? `${F.dictation.reduce((n, r) => n + r.correct, 0)}/${F.dictation.reduce((n, r) => n + r.total, 0)} words right` : null],
    ["Recordings", F.recordingIds?.length ? `${F.recordingIds.length}` : null],
    ["Text", F.text?.trim() ? F.text.trim() : null],
    ["Notes", F.notes?.trim() || null],
    ["Went well", b.log?.wentWell?.trim() || null],
    ["Fix next", b.log?.fixNext?.trim() || null],
  ].filter(([, v]) => v);

  return h(
    "details",
    { class: "day-entry" },
    h(
      "summary",
      {},
      h("span", { class: "day-date" }, capitalize(shortDate.format(parseLocalDate(iso)))),
      h("span", { class: "muted" }, FOCUS_TYPES[day.focusType]?.label ?? day.focusType),
      done === 3 ? tag("3/3 ✓", "tag-success") : tag(`${done}/3`, "tag-plain"),
    ),
    h(
      "dl",
      {},
      rows.map(([k, v]) => [h("dt", {}, k), h("dd", { lang: ["Words", "Text", "Prompt"].includes(k) ? "fr" : null }, v)]),
    ),
    h("p", {}, h("a", { href: `#/today?date=${iso}` }, "Open this day")),
  );
}
