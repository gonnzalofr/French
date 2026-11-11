import { h, tag, fill } from "../dom.js";
import { addMistake, mistakeStats } from "../mistakes.js";
import { toLocalISODate } from "../schedule.js";
import { mistakesQuiz, streakDots } from "./parts/mistakes-quiz.js";
import { accentBar, lastFocusedField } from "./parts/accent-bar.js";

const SOURCE_LABEL = { dictation: "dictée", writing: "writing", manual: "added", log: "log" };

export function renderMistakes({ store }) {
  const state = store.state;
  const save = () => store.save();
  const iso = toLocalISODate(new Date());
  let filter = "active";

  const statsEl = h("div", { class: "stats stats-3" });
  const listEl = h("div", {});
  const quizSlot = h("div", {});

  function paintStats() {
    const s = mistakeStats(state.mistakes);
    fill(statsEl,
      stat(s.active, "to practise"),
      stat(s.mastered, "mastered"),
      stat(state.mistakes.reduce((n, m) => n + (m.count ?? 1), 0), "times made"),
    );
  }

  function paintQuiz() {
    fill(quizSlot, mistakesQuiz({ state, iso, save, onChange: () => (paintStats(), paintList()) }));
  }

  // ---- add form ----
  const wrong = h("input", { type: "text", id: "mk-wrong", lang: "fr", spellcheck: "false", placeholder: "j’ai allé" });
  const right = h("input", { type: "text", id: "mk-right", lang: "fr", spellcheck: "false", placeholder: "je suis allé" });
  const note = h("input", { type: "text", id: "mk-note", placeholder: "Why, or a hint (optional)" });
  const addStatus = h("p", { class: "field-hint", "aria-live": "polite" });
  let getTarget = () => wrong;
  const form = h(
    "form",
    {
      class: "mistake-form",
      onsubmit: (e) => {
        e.preventDefault();
        const m = addMistake(state.mistakes, { wrong: wrong.value, right: right.value, note: note.value, source: "manual" }, iso);
        if (!m) {
          addStatus.textContent = "Fill in the correct form, and make it different from what you wrote.";
          return;
        }
        save();
        addStatus.textContent = m.count > 1 ? "Already on your list; counted again." : "Added.";
        wrong.value = right.value = note.value = "";
        wrong.focus();
        paintStats();
        paintList();
        paintQuiz();
      },
    },
    accentBar(() => getTarget()),
    h("div", { class: "form-grid" }, field("mk-wrong", "I wrote", wrong), field("mk-right", "Correct", right), field("mk-note", "Note", note)),
    h("div", { class: "row" }, h("button", { type: "submit", class: "btn btn-primary" }, "Add mistake"), addStatus),
  );

  getTarget = lastFocusedField(form, wrong);

  // ---- list ----
  const tabs = ["active", "mastered"].map((key) =>
    h(
      "button",
      {
        type: "button",
        class: "btn btn-small segment",
        onclick: () => {
          filter = key;
          paintList();
        },
      },
      key === "active" ? "To practise" : "Mastered",
    ),
  );

  function paintList() {
    tabs.forEach((t, i) => t.setAttribute("aria-pressed", String(["active", "mastered"][i] === filter)));
    const shown = state.mistakes
      .filter((m) => (filter === "mastered" ? m.mastered : !m.mastered))
      .sort((a, b) => (b.lastMade ?? "").localeCompare(a.lastMade ?? ""));
    fill(listEl,
      shown.length
        ? h(
            "ul",
            { class: "mistake-list" },
            shown.map((m) =>
              h(
                "li",
                {},
                h(
                  "div",
                  { class: "mistake-main", lang: "fr" },
                  h("del", { class: "w-bad" }, m.wrong || "—"),
                  h("span", { class: "arrow", "aria-hidden": "true" }, " → "),
                  h("strong", {}, m.right),
                ),
                h(
                  "div",
                  { class: "mistake-meta" },
                  tag(SOURCE_LABEL[m.source] ?? m.source, "tag-plain"),
                  (m.count ?? 1) > 1 ? tag(`×${m.count}`, "tag-warn") : null,
                  streakDots(m),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "btn btn-small btn-quiet",
                      "aria-label": `Delete ${m.right}`,
                      onclick: () => {
                        if (!confirm(`Delete “${m.wrong} → ${m.right}” from your list?`)) return;
                        state.mistakes.splice(state.mistakes.indexOf(m), 1);
                        save();
                        paintStats();
                        paintList();
                        paintQuiz();
                      },
                    },
                    "Delete",
                  ),
                ),
                m.note ? h("p", { class: "muted mistake-note" }, m.note) : null,
              ),
            ),
          )
        : h("p", { class: "muted" }, filter === "mastered" ? "Nothing mastered yet." : "Nothing to practise. Nice."),
    );
  }

  paintStats();
  paintQuiz();
  paintList();

  return h(
    "section",
    { class: "view", "aria-labelledby": "mistakes-title" },
    h(
      "header",
      { class: "view-head" },
      h("h2", { id: "mistakes-title" }, "My mistakes"),
      h("p", { class: "muted" }, "Collected from your dictées, Claude’s corrections and what you add here. Get one right on three different days to master it."),
    ),
    statsEl,
    h("div", { class: "card" }, h("h3", {}, "Practise now"), quizSlot),
    h("div", { class: "card" }, h("h3", {}, "Add a mistake"), form),
    h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", {}, "All mistakes"), h("div", { class: "segmented" }, tabs)), listEl),
  );
}

function stat(value, label) {
  return h("div", { class: "stat" }, h("span", { class: "stat-value" }, value), h("span", { class: "stat-label" }, label));
}

function field(id, label, input) {
  return h("div", { class: "field" }, h("label", { for: id }, label), input);
}
