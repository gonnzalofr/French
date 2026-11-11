import { h } from "../dom.js";

export function renderHistory() {
  return h(
    "section",
    { class: "view", "aria-labelledby": "history-title" },
    h("header", { class: "view-head" }, h("h2", { id: "history-title" }, "History")),
    h(
      "div",
      { class: "card" },
      h("p", { class: "muted" }, "Your streak and past sessions will show up here (milestone 7)."),
    ),
  );
}
