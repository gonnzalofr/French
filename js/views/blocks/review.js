import { h, autosaveField, extLink, actionButton, copyText } from "../../dom.js";
import { currentTopic, topicStatus } from "../../day.js";
import { itemsForWeek } from "../../picks.js";
import { averageRatings, collectWords, weekSummary, wordsToAnki } from "../../streak.js";
import { addDaysIso, daysBetween, FOCUS_TYPES, focusForDate, parseLocalDate, weekStartIso } from "../../schedule.js";

const WEEKDAY_FR = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" };
const WEEKDAY_EN = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function reviewBlock({ config, content, state, day, iso, save, onCleanup }) {
  const F = day.blocks.focus;
  const monday = weekStartIso(iso);
  const saturday = addDaysIso(monday, 5);
  const week = weekSummary(state.days, iso, (d) => focusForDate(parseLocalDate(d), config), config.startDate);

  // ---- this week ----
  const weekList = h(
    "ul",
    { class: "week-list" },
    week.map((w) =>
      h(
        "li",
        { "data-status": w.future || w.beforeStart ? "future" : w.done === 3 ? "complete" : w.done ? "partial" : "missed" },
        h("a", { href: `#/today?date=${w.iso}` }, WEEKDAY_FR[w.weekday]),
        h("span", {}, FOCUS_TYPES[w.focusType].short),
        h("span", { class: "muted" }, w.future ? "" : w.beforeStart ? "before start" : `${w.done}/3`),
      ),
    ),
  );

  // ---- suggestions ----
  const suggestions = [];
  for (const w of week) {
    if (w.future || w.beforeStart) continue;
    if (w.missing.includes("focus")) {
      suggestions.push(
        h(
          "li",
          {},
          "Catch up on ",
          h("a", { href: `#/today?date=${w.iso}` }, `${WEEKDAY_EN[w.weekday]}'s ${FOCUS_TYPES[w.focusType].label.toLowerCase()}`),
          ".",
        ),
      );
    }
  }
  const ratings = averageRatings(state.days, monday, saturday);
  const weakest = Object.entries(ratings)
    .filter(([, v]) => v != null)
    .sort((a, b) => a[1] - b[1])[0];
  if (weakest && weakest[1] < 3.5) {
    suggestions.push(
      h("li", {}, `Your weakest speaking area this week was ${weakest[0]} (${weakest[1]}/5). Redo a speaking prompt and focus only on that.`),
    );
  }
  const status = topicStatus(state);
  const { topic } = currentTopic(state, content);
  if (status[topic.id] === "again") {
    suggestions.push(h("li", {}, `Extra drill on ${topic.title}: it's carrying over to next week.`));
  }
  const corrections = week.map((w) => w.day?.blocks?.focus?.corrections?.trim()).filter(Boolean);
  if (corrections.length) {
    suggestions.push(h("li", {}, "Re-read your writing corrections and rewrite those sentences from memory:", h("blockquote", { lang: "fr" }, corrections.join("\n\n"))));
  }
  if (!suggestions.length) {
    suggestions.push(h("li", {}, "Nothing to catch up on. Pick anything from the free-choice list below."));
  }

  // ---- words ----
  const words = collectWords(state.days, monday, saturday);
  const wordsSection = h(
    "div",
    {},
    h("h4", {}, `New words this week (${words.length})`),
    words.length
      ? h("p", { class: "word-cloud", lang: "fr" }, words.map((w) => h("span", {}, w.entry)))
      : h("p", { class: "muted" }, "No words noted this week."),
    words.length
      ? h(
          "p",
          {},
          actionButton("Copy for Anki", () => copyText(wordsToAnki(words)), { className: "btn btn-small", doneLabel: "Copied ✓" }),
          " ",
          h("span", { class: "muted" }, "Paste into a .txt file and import it in Anki (File → Import), or download the file from History."),
        )
      : null,
  );

  // ---- false friends ----
  const weekIndex = Math.floor(daysBetween(config.startDate, iso) / 7);
  const friends = itemsForWeek(content.falseFriends.items, weekIndex, 2);
  const friendsSection = h(
    "div",
    {},
    h("h4", {}, "False friends of the week"),
    h(
      "ul",
      { class: "false-friends" },
      friends.map((f) =>
        h(
          "li",
          {},
          h("strong", { lang: "fr" }, f.fr),
          ` means ${f.means}. `,
          h("span", { class: "muted" }, `Not ${f.trap}.`),
        ),
      ),
    ),
  );

  // ---- free choice ----
  const ideas = [
    "Re-listen to this week's hardest episode with the transcript.",
    "Record Tuesday's prompt again and compare it with the first take.",
    "Rewrite a corrected text from memory.",
    "Watch an episode of a French show with French subtitles only.",
  ];
  const notes = autosaveField({
    id: `review-notes-${iso}`,
    label: "What I did today",
    value: F.notes,
    rows: 3,
    onSave: (v) => {
      F.notes = v;
      save();
    },
  });
  onCleanup(notes.dispose);

  return h(
    "div",
    { class: "review" },
    h("h4", {}, "This week"),
    weekList,
    h("h4", {}, "Suggested catch-up"),
    h("ul", { class: "suggestions" }, suggestions),
    wordsSection,
    friendsSection,
    h("h4", {}, "Free-choice ideas"),
    h("ul", {}, ideas.map((i) => h("li", {}, i))),
    h(
      "p",
      { class: "links" },
      content.resources.links.slice(0, 5).map((l) => extLink(l.label, l.url, { verify: l.verify })),
    ),
    notes.el,
  );
}
