import { h } from "../dom.js";

export function renderSettings({ config }) {
  return h(
    "section",
    { class: "view", "aria-labelledby": "settings-title" },
    h("header", { class: "view-head" }, h("h2", { id: "settings-title" }, "Settings")),
    h(
      "div",
      { class: "card" },
      h("h3", {}, "Storage origin"),
      h(
        "p",
        {},
        "Progress is saved per address. Always open ",
        h("code", {}, location.origin),
        " so it stays in one place.",
      ),
      h("p", { class: "muted" }, "Backup, import and reset arrive in milestone 8."),
    ),
    h(
      "div",
      { class: "card" },
      h("h3", {}, "Content"),
      h(
        "p",
        {},
        "Edit the files in ",
        h("code", {}, "data/"),
        " and reload. Programme start date: ",
        h("code", {}, config.startDate),
        ".",
      ),
    ),
  );
}
