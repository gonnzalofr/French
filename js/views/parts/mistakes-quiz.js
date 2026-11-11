import { h, tag, fill } from "../../dom.js";
import { gradeAnswer, MASTERED_AFTER, pickQuiz } from "../../mistakes.js";
import { accentBar, lastFocusedField } from "./accent-bar.js";

export function streakDots(m) {
  const n = Math.min(m.streak ?? 0, MASTERED_AFTER);
  return h(
    "span",
    { class: "dots", title: `${n} of ${MASTERED_AFTER} correct days`, "aria-label": `${n} of ${MASTERED_AFTER} correct days` },
    Array.from({ length: MASTERED_AFTER }, (_, i) => h("span", { class: i < n ? "dot on" : "dot" })),
  );
}

/**
 * Quiz on your own mistakes: see what you wrote (and the context), type the correct form.
 * Each mistake counts at most once per day; three correct days in a row masters it.
 */
export function mistakesQuiz({ state, iso, save, count = 8, onChange }) {
  const items = pickQuiz(state.mistakes, count, iso);
  if (!items.length) {
    const any = state.mistakes.some((m) => !m.mastered);
    return h(
      "p",
      { class: "muted" },
      any
        ? "You’ve already been quizzed on everything due today. Come back tomorrow."
        : "No mistakes to practise yet. They come from your dictées, Claude’s corrections, or ones you add yourself.",
    );
  }

  const list = h("ol", { class: "quiz" });
  const getTarget = lastFocusedField(list);

  items.forEach((m, i) => {
    const input = h("input", {
      type: "text",
      lang: "fr",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      "aria-label": `Correct form for question ${i + 1}`,
      placeholder: "Correct form",
    });
    const feedback = h("p", { class: "quiz-feedback", "aria-live": "polite" });
    const dots = h("span", {}, streakDots(m));
    const checkBtn = h("button", { type: "button", class: "btn btn-small btn-primary" }, "Check");

    const check = () => {
      if (!input.value.trim()) return;
      const ok = gradeAnswer(m, input.value, iso);
      save();
      input.disabled = true;
      checkBtn.disabled = true;
      fill(dots, streakDots(m));
      feedback.className = ok ? "quiz-feedback ok" : "quiz-feedback bad";
      fill(feedback,
        ...[
          ok ? "Correct." : "Not quite: ",
          ok ? null : h("strong", { lang: "fr" }, m.right),
          m.mastered ? " " : null,
          m.mastered ? tag("mastered", "tag-success") : null,
        ].filter(Boolean),
      );
      onChange?.();
      list.querySelectorAll("input:not(:disabled)")[0]?.focus();
    };
    checkBtn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });

    list.append(
      h(
        "li",
        { class: "quiz-item" },
        h(
          "p",
          { class: "quiz-prompt" },
          h("span", { class: "muted" }, "You wrote "),
          h("del", { class: "w-bad", lang: "fr" }, m.wrong || "(nothing)"),
          " ",
          dots,
        ),
        m.note ? h("p", { class: "quiz-note muted" }, m.note) : null,
        h("div", { class: "row" }, input, checkBtn),
        feedback,
      ),
    );
  });

  return h("div", { class: "quiz-panel" }, accentBar(getTarget), list);
}
