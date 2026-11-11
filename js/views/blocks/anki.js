import { h, extLink } from "../../dom.js";

export function ankiBlock({ config }) {
  return h(
    "div",
    {},
    h("p", { class: "links" }, config.anki.links.map((l) => extLink(l.label, l.url, { verify: l.verify }))),
    h(
      "p",
      { class: "muted" },
      "Clear today’s due reviews first. On Sundays, add the week’s new words: History → Copy words for Anki.",
    ),
  );
}
